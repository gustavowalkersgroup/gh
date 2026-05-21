#!/usr/bin/env python3
"""
Renovabe Instagram Pain Point Analyzer
Uso: python main.py [--skip-scrape] [--manual-data arquivo.json]
"""
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def main():
    parser = argparse.ArgumentParser(description="Analisa dores no Instagram da Renovabe")
    parser.add_argument("--skip-scrape", action="store_true", help="Usa cache existente")
    parser.add_argument("--manual-data", help="Caminho para JSON com dados exportados manualmente")
    parser.add_argument("--api-key", help="Chave da API Anthropic (ou ANTHROPIC_API_KEY no .env)")
    parser.add_argument("--max-posts", type=int, default=30, help="Máximo de posts (padrão: 30)")
    parser.add_argument("--ig-user", help="Usuário Instagram para login (ou IG_USERNAME no .env)")
    parser.add_argument("--ig-pass", help="Senha Instagram para login (ou IG_PASSWORD no .env)")
    args = parser.parse_args()

    api_key = args.api_key or os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("[erro] Defina ANTHROPIC_API_KEY no .env ou passe --api-key")
        sys.exit(1)

    # --- Etapa 1: Carregar dados ---
    if args.manual_data:
        print(f"[main] Carregando dados manuais de {args.manual_data}")
        posts = json.loads(Path(args.manual_data).read_text())
    else:
        from scraper import scrape, PROFILE, DATA_DIR
        cache_file = DATA_DIR / f"{PROFILE}_posts.json"

        if args.skip_scrape and cache_file.exists():
            print(f"[main] Usando cache: {cache_file}")
            posts = json.loads(cache_file.read_text())
        else:
            ig_user = args.ig_user or os.getenv("IG_USERNAME")
            ig_pass = args.ig_pass or os.getenv("IG_PASSWORD")
            posts = scrape(max_posts=args.max_posts, ig_user=ig_user, ig_pass=ig_pass)

    if not posts:
        print("[erro] Nenhum dado disponível para análise.")
        sys.exit(1)

    total_comments = sum(len(p["comments"]) for p in posts)
    print(f"\n[main] {len(posts)} posts | {total_comments} comentários\n")

    # --- Etapa 2: Análise ---
    from analyzer import analyze
    analyze(posts, api_key=api_key)

    print("\n" + "="*60)
    print("Relatório salvo em: data/renovabeoficial_pain_points.md")
    print("="*60)


if __name__ == "__main__":
    main()
