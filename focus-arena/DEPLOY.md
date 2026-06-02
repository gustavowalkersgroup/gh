# 🚀 Deploy do Focus Arena no Ubuntu

Guia copiar-e-colar pra subir o jogo num servidor Ubuntu, com HTTPS, rodando 24/7
via `systemd` e exposto por trás do nginx. No fim você terá uma URL pública tipo
`https://focus.seudominio.com.br` — que serve o jogo **e** recebe o webhook do WhatsApp.

Tempo estimado: ~5 minutos.

## Pré-requisitos
- Ubuntu com acesso `sudo`.
- Um (sub)domínio apontando (registro **A**) pro IP do servidor — ex.: `focus.nextags.app.br`.
- Portas **80** e **443** liberadas no firewall/cloud.

---

## 1. Instalar Node.js (LTS)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx
node --version   # deve mostrar v20.x
```

## 2. Clonar o repositório
```bash
sudo git clone -b claude/tender-euler-KFNo8 \
  https://github.com/gustavowalkersgroup/gh.git /opt/focus-arena
sudo chown -R www-data:www-data /opt/focus-arena
```
> O jogo fica em `/opt/focus-arena/focus-arena`. (Depois que o PR #1 for mergeado, troque
> `-b claude/tender-euler-KFNo8` pelo branch padrão.)

## 3. Variáveis de ambiente (com seu token)
Crie `/etc/focus-arena.env` — **este arquivo NÃO vai pro git** e fica só no servidor:
```bash
sudo tee /etc/focus-arena.env >/dev/null <<'EOF'
PORT=4173
HOST=127.0.0.1
CLICKUP_TOKEN=pk_SEU_TOKEN_AQUI
WHATSAPP_SHARED_SECRET=troque-por-um-segredo-forte
EOF
sudo chmod 600 /etc/focus-arena.env
```

## 4. Subir como serviço (systemd)
```bash
sudo cp /opt/focus-arena/focus-arena/deploy/focus-arena.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now focus-arena
sudo systemctl status focus-arena --no-pager   # deve estar "active (running)"
# teste local:
curl -s http://127.0.0.1:4173/api/health        # {"ok":true,"clickup":true}
```
`clickup":true` confirma que o token foi lido. Atualizar no futuro:
```bash
cd /opt/focus-arena && sudo git pull && sudo systemctl restart focus-arena
```

## 5. Nginx + HTTPS
```bash
sudo cp /opt/focus-arena/focus-arena/deploy/nginx.conf.example \
  /etc/nginx/sites-available/focus-arena
sudo nano /etc/nginx/sites-available/focus-arena   # troque o server_name pelo seu domínio
sudo ln -s /etc/nginx/sites-available/focus-arena /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# TLS grátis (Let's Encrypt):
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d focus.seudominio.com.br
```
Pronto: o jogo abre em `https://focus.seudominio.com.br` 🎯

## 6. Ligar as integrações
- **ClickUp**: já funciona ao vivo (o servidor faz o proxy autenticado). Abra o jogo e veja
  o selo 🟢 *"ClickUp ao vivo"*.
- **WhatsApp / n8n**: no workflow *"Focus Arena - Triagem de WhatsApp"*, no nó **"Enviar pro
  Focus Arena"**, use a URL `https://focus.seudominio.com.br/api/whatsapp`. Se você definiu
  `WHATSAPP_SHARED_SECRET`, adicione no nó HTTP um header `x-fa-secret` com o mesmo valor
  (via credencial *Header Auth*). Ative o workflow e aponte sua IA do WhatsApp pra
  `https://<seu-n8n>/webhook/whatsapp-in`.

## Verificação rápida
```bash
curl -s https://focus.seudominio.com.br/api/health
curl -s -X POST https://focus.seudominio.com.br/api/whatsapp \
  -H "Content-Type: application/json" -H "x-fa-secret: SEU_SEGREDO" \
  -d '{"from":"Teste","text":"oi","urgency":"high"}'
```
Se a 2ª chamada retornar `{"queued":true,...}`, a mensagem aparece no jogo na próxima atualização. ✅

## Notas de segurança
- `HOST=127.0.0.1` mantém a porta 4173 acessível só localmente; o público entra pelo nginx (443).
- `/etc/focus-arena.env` em `chmod 600` guarda o token fora do repositório.
- Regenere o token do ClickUp se ele tiver sido exposto.
