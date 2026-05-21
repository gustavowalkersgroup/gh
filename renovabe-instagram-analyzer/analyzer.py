import anthropic
import json
from pathlib import Path

PROFILE = "renovabeoficial"
DATA_DIR = Path("data")
REPORT_FILE = DATA_DIR / f"{PROFILE}_pain_points.md"

SYSTEM_PROMPT = """Você é um especialista em análise de marketing digital e comportamento do consumidor.
Sua tarefa é analisar comentários de Instagram de uma marca e identificar as principais dores, frustrações,
dúvidas recorrentes e necessidades não atendidas dos seguidores.

Seja objetivo, direto e forneça insights acionáveis para o time de marketing."""

ANALYSIS_PROMPT = """Analise os comentários abaixo do perfil @{profile} no Instagram e identifique:

1. **Top 5 Dores / Frustrações** — problemas que os seguidores mencionam com frequência
2. **Top 5 Dúvidas Recorrentes** — perguntas que aparecem muito nos comentários
3. **Sentimento Geral** — percentual estimado positivo / neutro / negativo
4. **Oportunidades de Conteúdo** — temas que geraram mais engajamento ou perguntas
5. **Recomendações Imediatas** — 3 ações concretas que a marca pode tomar

---

DADOS DOS POSTS (últimos {n_posts} posts, {n_comments} comentários):

{posts_text}

---

Responda em Português do Brasil. Use markdown com emojis para facilitar a leitura."""


def build_posts_text(posts: list[dict]) -> str:
    lines = []
    for i, post in enumerate(posts, 1):
        caption_preview = (post["caption"][:150] + "...") if len(post["caption"]) > 150 else post["caption"]
        lines.append(f"\n### Post {i} ({post['date'][:10]}) — {post['likes']} curtidas")
        if caption_preview:
            lines.append(f"**Legenda:** {caption_preview}")
        if post["comments"]:
            lines.append("**Comentários:**")
            for c in post["comments"]:
                lines.append(f"- @{c['owner']}: {c['text']}")
        else:
            lines.append("*(sem comentários coletados)*")
    return "\n".join(lines)


def analyze(posts: list[dict], api_key: str | None = None) -> str:
    DATA_DIR.mkdir(exist_ok=True)

    client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()

    posts_text = build_posts_text(posts)
    total_comments = sum(len(p["comments"]) for p in posts)

    prompt = ANALYSIS_PROMPT.format(
        profile=PROFILE,
        n_posts=len(posts),
        n_comments=total_comments,
        posts_text=posts_text,
    )

    print(f"[analyzer] Enviando {len(posts)} posts e {total_comments} comentários para análise...")

    with client.messages.stream(
        model="claude-opus-4-7",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        report = ""
        for text in stream.text_stream:
            print(text, end="", flush=True)
            report += text

    print("\n")

    header = f"# Análise de Dores — @{PROFILE}\n_Gerado em {__import__('datetime').datetime.now().strftime('%d/%m/%Y %H:%M')}_\n\n"
    full_report = header + report

    REPORT_FILE.write_text(full_report, encoding="utf-8")
    print(f"[analyzer] Relatório salvo em {REPORT_FILE}")
    return full_report


if __name__ == "__main__":
    cache_file = DATA_DIR / f"{PROFILE}_posts.json"
    if not cache_file.exists():
        print("[erro] Rode primeiro: python scraper.py")
        exit(1)
    posts = json.loads(cache_file.read_text())
    analyze(posts)
