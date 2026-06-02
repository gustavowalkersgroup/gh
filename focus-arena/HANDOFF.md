# 🤝 HANDOFF — Deploy do Focus Arena (sessão Claude no servidor)

> **Para a nova sessão do Claude Code rodando DENTRO do servidor Ubuntu.**
> Você tem shell real com `sudo`. Sua missão: **deixar o Focus Arena no ar, acessível pelo IP
> do servidor** (sem domínio, sem HTTPS). Execute os passos, adaptando ao ambiente real, e
> verifique cada etapa antes de seguir.

---

## Contexto (o que é isto)
Focus Arena é um jogo de navegador de foco para TDAH (Pomodoro + arena de mira estilo AimLab +
RPG) integrado ao ClickUp e a um webhook de WhatsApp. Código: repositório
`gustavowalkersgroup/gh`, pasta `focus-arena/`, branch `claude/tender-euler-KFNo8`
(se o PR #1 já tiver sido mergeado, use o branch padrão).

Arquitetura em produção:
- Um servidor **Node puro, zero dependências** (`focus-arena/server/webhook-server.js`) que:
  1. serve o jogo (arquivos estáticos),
  2. faz **proxy autenticado** do ClickUp em `/api/clickup/*` (usa `CLICKUP_TOKEN`, resolve CORS),
  3. recebe o **webhook do WhatsApp** em `POST /api/whatsapp` e entrega ao jogo via polling.
- Acesso por **HTTP via IP** (ex.: `http://203.0.113.10`). Sem domínio ⇒ sem Let's Encrypt.
  O jogo não usa nenhum recurso que exija "secure context", então HTTP funciona 100%.

## Restrições / decisões já tomadas
- **Sem domínio, sem TLS.** Não rode certbot. Sirva em HTTP na porta 80 via nginx.
- O `CLICKUP_TOKEN` **nunca** deve ser commitado, impresso em logs, nem colado em arquivo do
  repositório. Ele vai só em `/etc/focus-arena.env` (chmod 600). **Peça o token ao usuário**
  no início — não invente um.
- Como o webhook ficará exposto em HTTP público, **defina `WHATSAPP_SHARED_SECRET`** para evitar
  que terceiros injetem mensagens.

---

## Passo 0 — Pré-flight
```bash
whoami; sudo -n true 2>/dev/null && echo "sudo ok"
. /etc/os-release && echo "$PRETTY_NAME"
ip -4 addr show scope global | awk '/inet/{print $2}'   # IPs do servidor
```
Pergunte ao usuário **qual IP ele usa pra acessar o servidor** (numa VPS pode ser um IP público
diferente do que aparece em `ip addr`). Guarde como `SERVER_IP`. Confirme que **a porta 80 está
liberada** no firewall do provedor (Security Group / Cloud Firewall), senão o jogo não abre de fora.

## Passo 1 — Dependências
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx
node --version   # esperado: v20.x
```

## Passo 2 — Código
Clone na `/opt/focus-arena` (repo pode ser privado → use a auth de git/`gh` do usuário):
```bash
sudo git clone -b claude/tender-euler-KFNo8 https://github.com/gustavowalkersgroup/gh.git /opt/focus-arena
sudo chown -R www-data:www-data /opt/focus-arena
```
O jogo fica em `/opt/focus-arena/focus-arena`. Se o clone falhar por auth, peça ao usuário pra
rodar `gh auth login` ou fornecer um token, ou faça o clone com o usuário dele.

## Passo 3 — Variáveis de ambiente (PEÇA O TOKEN AO USUÁRIO)
Gere um segredo forte para o webhook e escreva o env file (substitua `COLE_O_TOKEN`):
```bash
WA_SECRET=$(openssl rand -hex 24)
sudo tee /etc/focus-arena.env >/dev/null <<EOF
PORT=4173
HOST=127.0.0.1
CLICKUP_TOKEN=COLE_O_TOKEN_DO_USUARIO_AQUI
WHATSAPP_SHARED_SECRET=$WA_SECRET
EOF
sudo chmod 600 /etc/focus-arena.env
echo "Guarde este WHATSAPP_SHARED_SECRET para configurar no n8n: $WA_SECRET"
```
> `HOST=127.0.0.1` ⇒ o Node só escuta local; o público entra pelo nginx (porta 80).

## Passo 4 — Serviço systemd
```bash
sudo cp /opt/focus-arena/focus-arena/deploy/focus-arena.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now focus-arena
sudo systemctl status focus-arena --no-pager
curl -s http://127.0.0.1:4173/api/health    # esperado: {"ok":true,"clickup":true}
```
`"clickup":true` confirma que o token foi lido. Se vier `false`, o token não está no env file.

## Passo 5 — nginx na porta 80 (responde em qualquer IP/host)
Crie um site que responde no IP (sem `server_name` específico):
```bash
sudo tee /etc/nginx/sites-available/focus-arena >/dev/null <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 2m;
    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/focus-arena /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
Se o `ufw` estiver ativo: `sudo ufw allow 80/tcp && sudo ufw allow OpenSSH`.

> **Alternativa sem nginx** (mais simples ainda): pôr `HOST=0.0.0.0` no env file, liberar a porta
> 4173 e acessar `http://SERVER_IP:4173`. Use isto só se o nginx der trabalho.

## Passo 6 — Testar de fora
No próprio servidor, simulando o acesso público:
```bash
curl -s http://SERVER_IP/api/health
curl -s -X POST http://SERVER_IP/api/whatsapp \
  -H 'Content-Type: application/json' -H "x-fa-secret: $WA_SECRET" \
  -d '{"from":"Teste","text":"deploy ok?","urgency":"high"}'
```
A 1ª deve dar `{"ok":true,"clickup":true}`; a 2ª `{"queued":true,...}`. Peça ao usuário pra abrir
`http://SERVER_IP` no navegador: ele deve ver o jogo com o selo 🟢 **"ClickUp ao vivo"** e, ao
clicar em 💬, a mensagem de teste.

## Passo 7 — Integração WhatsApp (n8n) — orientar o usuário
O workflow **"Focus Arena - Triagem de WhatsApp"** já existe no n8n (`https://nextags.app.br`).
Instrua o usuário a:
1. No nó **"Enviar pro Focus Arena"**, definir a URL `http://SERVER_IP/api/whatsapp`.
2. Adicionar no nó HTTP um header `x-fa-secret` com o valor do `WHATSAPP_SHARED_SECRET`
   (use uma credencial *Header Auth* no n8n).
3. **Ativar** o workflow.
4. Apontar a IA de leitura do WhatsApp para `https://nextags.app.br/webhook/whatsapp-in`.

---

## Critérios de pronto (checklist)
- [ ] `systemctl status focus-arena` = active (running) e habilitado no boot.
- [ ] `curl http://SERVER_IP/api/health` → `{"ok":true,"clickup":true}`.
- [ ] Jogo abre em `http://SERVER_IP` e mostra 🟢 "ClickUp ao vivo" com as tarefas reais.
- [ ] POST de teste no webhook aparece no dock 💬 do jogo.
- [ ] `/etc/focus-arena.env` está em `chmod 600` e o token **não** está em nenhum arquivo do repo.

## Manutenção
```bash
cd /opt/focus-arena && sudo git pull && sudo systemctl restart focus-arena   # atualizar
sudo journalctl -u focus-arena -f                                            # logs
```

## Troubleshooting
- **502 no nginx** → o serviço Node caiu; veja `journalctl -u focus-arena -e`.
- **`clickup":false`** → token ausente/errado no env file (reescreva e `systemctl restart`).
- **Jogo abre mas mostra "Offline"** → o navegador está acessando os arquivos sem passar pelo
  servidor, ou `/api/health` não responde; confirme nginx → 127.0.0.1:4173.
- **Webhook 401** → o header `x-fa-secret` no n8n não bate com o `WHATSAPP_SHARED_SECRET`.
- **Não abre de fora** → porta 80 bloqueada no firewall do provedor (não só no `ufw`).

## Segurança
- HTTP por IP é **não criptografado**: o tráfego (inclusive tarefas do ClickUp) trafega em claro.
  Aceitável para uso interno/teste; se for expor a sério, use um domínio + TLS depois.
- Mantenha o webhook protegido pelo `WHATSAPP_SHARED_SECRET`.
- Se o token do ClickUp já apareceu em algum chat, **regenere-o** no ClickUp depois do deploy.
