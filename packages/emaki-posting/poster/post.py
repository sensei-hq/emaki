#!/usr/bin/env python3
"""Post what was approved on the desk to YouTube, Instagram and X. Runs in CI (see the package README for a GitHub Actions workflow).

    python3 post.py [--live] [--only youtube,x]

It asks /api/admin/queue for the posts that are approved for exactly the content now staged, due (the article's date
has come) and not yet posted; the queue is empty while posting is paused. For each post it downloads the media through
the admin API, checks every file's sha256 against what was approved, posts it, and reports the outcome to
/api/admin/posted (the timeline and audit log). Without --live (the default, and POST_MODE=dry-run in the workflow)
it does everything except the posting itself and reports "dry-run".

After a real post it writes the link into the piece's `social` in STORIES_INDEX (default content/stories/index.json;
the workflow commits that, so the next build links and embeds the post).

Environment (CI secrets; see the package README):
  ADMIN_ORIGIN                         https://your-site.example (required)
  POSTER_CLIENT_ID, POSTER_CLIENT_SECRET   the poster's Cloudflare Access service token
  YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN      YouTube Data API (scope youtube.upload); YT_PRIVACY=unlisted for tests
  IG_USER_ID, IG_ACCESS_TOKEN, IG_GRAPH_VERSION         Instagram Graph API (instagram_content_publish)
  X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET   X API, OAuth 1.0a user context (or X_USER_TOKEN: OAuth 2.0)
"""
import hashlib, json, os, sys, time, urllib.parse
from pathlib import Path

INDEX = Path(os.environ.get('STORIES_INDEX', 'content/stories/index.json'))
API = os.environ.get('ADMIN_API', '/api/admin').rstrip('/')
sys.path.insert(0, str(Path(__file__).absolute().parent))
from net import Failed, http, jhttp  # noqa: E402
from x import x_post  # noqa: E402
from youtube import yt_upload_caption, yt_set_thumbnail  # noqa: E402
E = os.environ
RUN = f"{E.get('GITHUB_SERVER_URL', '')}/{E.get('GITHUB_REPOSITORY', '')}/actions/runs/{E.get('GITHUB_RUN_ID', '')}" if E.get('GITHUB_RUN_ID') else 'local'


def admin(method, path, data=None):
    h = {'CF-Access-Client-Id': E['POSTER_CLIENT_ID'], 'CF-Access-Client-Secret': E['POSTER_CLIENT_SECRET']}
    return jhttp(method, E['ADMIN_ORIGIN'].rstrip('/') + path, data, h)


def fetch_media(item):
    """Every media file of a post, downloaded and checked against the approved sha256."""
    out = []
    for m in item['post']['media']:
        h = {'CF-Access-Client-Id': E['POSTER_CLIENT_ID'], 'CF-Access-Client-Secret': E['POSTER_CLIENT_SECRET']}
        _, _, data = http('GET', E['ADMIN_ORIGIN'].rstrip('/') + API + '/media/' + m['key'], headers=h)
        if hashlib.sha256(data).hexdigest() != m['sha256']:
            raise Failed(f"{m['key']}: the file does not match the approved sha256; not posting")
        out.append({**m, 'data': data})
    return out


# ── YouTube ──────────────────────────────────────────────────────────────────────────────────────────────

def youtube(item, media, live):
    p = item['post']
    video = next((m for m in media if m['type'].startswith('video')), None)
    if not video:
        raise Failed('no video staged')
    if not live:
        return None, f"would upload {len(video['data']) // 1024} KB as {'a Short' if p.get('short') else 'a video'}: {p.get('title')}"
    tok = json.loads(http('POST', 'https://oauth2.googleapis.com/token', urllib.parse.urlencode({
        'client_id': E['YT_CLIENT_ID'], 'client_secret': E['YT_CLIENT_SECRET'], 'refresh_token': E['YT_REFRESH_TOKEN'], 'grant_type': 'refresh_token'}).encode(),
        {'content-type': 'application/x-www-form-urlencoded'})[2])['access_token']
    meta = {'snippet': {'title': p['title'][:100], 'description': p.get('description', '')[:5000], 'tags': p.get('tags', [])[:30], 'categoryId': '28'},
            'status': {'privacyStatus': E.get('YT_PRIVACY') or 'public', 'selfDeclaredMadeForKids': False}}
    _, h, _ = http('POST', 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', json.dumps(meta).encode(),
                   {'authorization': f'Bearer {tok}', 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': str(len(video['data']))})
    loc = h.get('Location') or h.get('location')
    _, _, b = http('PUT', loc, video['data'], {'authorization': f'Bearer {tok}', 'content-type': 'video/mp4'})
    vid = json.loads(b)['id']
    srt = next((m for m in media if m['key'].endswith('.srt')), None)
    thumb = next((m for m in media if m['key'].endswith('-thumb.jpg')), None)
    if srt:
        yt_upload_caption(tok, vid, srt['data'])
    if thumb:
        yt_set_thumbnail(tok, vid, thumb['data'])
    return (f'https://www.youtube.com/shorts/{vid}' if p.get('short') else f'https://www.youtube.com/watch?v={vid}'), vid


# ── Instagram ────────────────────────────────────────────────────────────────────────────────────────────

def graph(method, path, params):
    v = E.get('IG_GRAPH_VERSION', 'v21.0')
    q = urllib.parse.urlencode({**params, 'access_token': E['IG_ACCESS_TOKEN']})
    url = f'https://graph.facebook.com/{v}/{path}'
    _, _, b = http(method, url + ('?' + q if method == 'GET' else ''), q.encode() if method == 'POST' else None,
                   {'content-type': 'application/x-www-form-urlencoded'} if method == 'POST' else {})
    return json.loads(b)


def wait_ready(container):
    for _ in range(60):
        st = graph('GET', container, {'fields': 'status_code'}).get('status_code')
        if st == 'FINISHED':
            return
        if st in ('ERROR', 'EXPIRED'):
            raise Failed(f'Instagram could not process the media ({st})')
        time.sleep(10)
    raise Failed('Instagram took too long to process the media')


def publish(container):
    wait_ready(container)
    mid = graph('POST', f"{E['IG_USER_ID']}/media_publish", {'creation_id': container})['id']
    return graph('GET', mid, {'fields': 'permalink'}).get('permalink'), mid


def instagram_reel(item, media, live):
    video = next((m for m in item['media'] if m['type'].startswith('video')), None)
    if not video or not video.get('url'):
        raise Failed('no video, or no signed media URL (MEDIA_URL_SECRET unset on the site)')
    if not live:
        return None, f"would post a Reel ({len(media[0]['data']) // 1024} KB) with a {len(item['post'].get('caption', ''))}-character caption"
    params = {'media_type': 'REELS', 'video_url': video['url'], 'caption': item['post'].get('caption', ''), 'share_to_feed': 'true'}
    cover = next((m for m in item['media'] if m['type'].startswith('image') and m.get('url')), None)
    if cover:
        params['cover_url'] = cover['url']
    c = graph('POST', f"{E['IG_USER_ID']}/media", params)['id']
    return publish(c)


def instagram_carousel(item, media, live):
    imgs = [m for m in item['media'] if m['type'].startswith('image')]
    if not 2 <= len(imgs) <= 10 or not all(m.get('url') for m in imgs):
        raise Failed(f'a carousel needs 2–10 images with signed URLs (have {len(imgs)})')
    if not live:
        return None, f'would post a {len(imgs)}-slide carousel'
    kids = [graph('POST', f"{E['IG_USER_ID']}/media", {'image_url': m['url'], 'is_carousel_item': 'true'})['id'] for m in imgs]
    for k in kids:
        wait_ready(k)
    c = graph('POST', f"{E['IG_USER_ID']}/media", {'media_type': 'CAROUSEL', 'children': ','.join(kids), 'caption': item['post'].get('caption', '')})['id']
    return publish(c)


# ── The run ────────────────────────────────────────────────────────────────────────────────────────────

POSTERS = {'youtube': youtube, 'instagram_reel': instagram_reel, 'instagram_carousel': instagram_carousel, 'x': x_post}
SOCIAL = {'youtube': 'youtube', 'instagram_reel': 'instagram', 'x': 'x'}


def record_link(slug, channel, url):
    key = SOCIAL.get(channel)
    if not key or not url:
        return
    index = json.loads(INDEX.read_text())
    for a in index:
        if a['slug'] == slug and not a.setdefault('social', {}).get(key):
            a['social'][key] = url
    INDEX.write_text(json.dumps(index, indent=2, ensure_ascii=False) + '\n')


def parse_args(argv):
    """(live, only): --live posts for real; --only youtube,x limits the run to those channels."""
    only = argv[argv.index('--only') + 1].split(',') if '--only' in argv else None
    return '--live' in argv, only


def report(item, status, **fields):
    """Tell the desk how one post went (its timeline and audit log)."""
    admin('POST', API + '/posted', {'slug': item['slug'], 'channel': item['channel'], 'content_sha': item['content_sha'], 'status': status, **fields, 'run': RUN})


def post_one(item, live):
    """Download and check the media, post it (or describe it on a dry run), report it, and link a real post."""
    ch = item['channel']
    url, ext = POSTERS[ch](item, fetch_media(item), live)
    status = 'posted' if live else 'dry-run'
    print(f"  {item['slug']} · {ch}: {status} {url or ext}")
    report(item, status, url=url or '', external_id=ext if live else '', detail='' if live else ext)
    if live:
        record_link(item['slug'], ch, url)


def try_post(item, live):
    """post_one, with a failure printed and reported instead of raised. True when it went through."""
    try:
        post_one(item, live)
        return True
    except (Failed, KeyError) as err:
        print(f"  {item['slug']} · {item['channel']}: FAILED {err}")
        report(item, 'failed', detail=str(err)[:1500])
        return False


def main():
    live, only = parse_args(sys.argv)
    q = admin('GET', API + '/queue')
    print(f"{q['today']}: {'paused' if q['paused'] else 'on'}, {len(q['items'])} approved post(s) due · {'LIVE' if live else 'dry run'}")
    chosen = (item for item in q['items'] if not only or item['channel'] in only)
    failures = sum(not try_post(item, live) for item in chosen)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
