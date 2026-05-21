import instaloader
import json
import time
import random
import os
from pathlib import Path

PROFILE = "renovabeoficial"
DATA_DIR = Path("data")
MAX_POSTS = 30
MAX_COMMENTS_PER_POST = 50


def scrape(
    username: str = PROFILE,
    max_posts: int = MAX_POSTS,
    ig_user: str | None = None,
    ig_pass: str | None = None,
) -> list[dict]:
    DATA_DIR.mkdir(exist_ok=True)
    cache_file = DATA_DIR / f"{username}_posts.json"

    if cache_file.exists():
        print(f"[cache] Carregando dados salvos de {cache_file}")
        return json.loads(cache_file.read_text())

    ig_user = ig_user or os.getenv("IG_USERNAME")
    ig_pass = ig_pass or os.getenv("IG_PASSWORD")

    print(f"[scraper] Iniciando coleta do perfil @{username} ...")

    L = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=True,
        save_metadata=False,
        quiet=True,
    )

    if ig_user and ig_pass:
        print(f"[scraper] Fazendo login como @{ig_user} ...")
        try:
            L.login(ig_user, ig_pass)
            print("[scraper] Login realizado com sucesso!")
        except Exception as e:
            print(f"[aviso] Login falhou: {e}. Tentando sem login...")
    else:
        print("[aviso] IG_USERNAME/IG_PASSWORD não definidos. Tentando sem login (pode falhar).")

    try:
        profile = instaloader.Profile.from_username(L.context, username)
    except Exception as e:
        print(f"[erro] Não foi possível acessar o perfil: {e}")
        raise

    print(f"[scraper] @{profile.username} — {profile.followers} seguidores — {profile.mediacount} posts")

    posts_data = []
    count = 0

    for post in profile.get_posts():
        if count >= max_posts:
            break

        post_info = {
            "shortcode": post.shortcode,
            "date": post.date_utc.isoformat(),
            "likes": post.likes,
            "caption": post.caption or "",
            "comments_count": post.comments,
            "url": f"https://www.instagram.com/p/{post.shortcode}/",
            "comments": [],
        }

        print(f"  [{count+1}/{max_posts}] Post {post.shortcode} ({post.date_utc.strftime('%d/%m/%Y')}) — {post.likes} curtidas, {post.comments} comentários")

        try:
            comment_count = 0
            for comment in post.get_comments():
                if comment_count >= MAX_COMMENTS_PER_POST:
                    break
                post_info["comments"].append({
                    "text": comment.text,
                    "owner": comment.owner.username,
                    "likes": comment.likes_count,
                })
                comment_count += 1
            time.sleep(random.uniform(1.5, 3.0))
        except Exception as e:
            print(f"  [aviso] Comentários não acessíveis: {e}")

        posts_data.append(post_info)
        count += 1
        time.sleep(random.uniform(2.0, 4.0))

    cache_file.write_text(json.dumps(posts_data, ensure_ascii=False, indent=2))
    print(f"\n[scraper] {len(posts_data)} posts salvos em {cache_file}")
    return posts_data


if __name__ == "__main__":
    data = scrape()
    print(f"\nTotal de posts: {len(data)}")
    total_comments = sum(len(p["comments"]) for p in data)
    print(f"Total de comentários coletados: {total_comments}")
