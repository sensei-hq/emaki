"""X for the poster: request signing, chunked media upload, and the post with its reply thread. Stdlib only."""
import base64, hashlib, hmac, os, secrets, time, urllib.parse

from net import Failed, http, jhttp

E = os.environ


def x_auth(method, url, params=None):
    """Authorization header: OAuth 2.0 user token if given, else OAuth 1.0a (JSON / multipart bodies are not signed)."""
    if E.get('X_USER_TOKEN'):
        return {'authorization': f"Bearer {E['X_USER_TOKEN']}"}
    pct = lambda s: urllib.parse.quote(str(s), safe='~')
    o = {'oauth_consumer_key': E['X_API_KEY'], 'oauth_nonce': secrets.token_hex(16), 'oauth_signature_method': 'HMAC-SHA1',
         'oauth_timestamp': str(int(time.time())), 'oauth_token': E['X_ACCESS_TOKEN'], 'oauth_version': '1.0'}
    base_url, _, query = url.partition('?')
    allp = {**o, **(params or {}), **dict(urllib.parse.parse_qsl(query))}
    base = '&'.join([method, pct(base_url), pct('&'.join(f'{pct(k)}={pct(allp[k])}' for k in sorted(allp)))])
    key = f"{pct(E['X_API_SECRET'])}&{pct(E['X_ACCESS_SECRET'])}"
    o['oauth_signature'] = base64.b64encode(hmac.new(key.encode(), base.encode(), hashlib.sha1).digest()).decode()
    return {'authorization': 'OAuth ' + ', '.join(f'{pct(k)}="{pct(v)}"' for k, v in sorted(o.items()))}


def x_upload(data, mime):
    init = 'https://api.x.com/2/media/upload/initialize'
    mid = jhttp('POST', init, {'media_type': mime, 'total_bytes': len(data), 'media_category': 'tweet_video' if mime.startswith('video') else 'tweet_image'}, x_auth('POST', init))['data']['id']
    chunk = 4 * 1024 * 1024
    for i in range(0, len(data), chunk):
        url = f'https://api.x.com/2/media/upload/{mid}/append'
        boundary = secrets.token_hex(12)
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="segment_index"\r\n\r\n{i // chunk}\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="media"; filename="chunk"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() + data[i:i + chunk] + f'\r\n--{boundary}--\r\n'.encode()
        http('POST', url, body, {**x_auth('POST', url), 'content-type': f'multipart/form-data; boundary={boundary}'})
    fin = f'https://api.x.com/2/media/upload/{mid}/finalize'
    info = jhttp('POST', fin, None, x_auth('POST', fin)).get('data', {}).get('processing_info')
    while info and info.get('state') in ('pending', 'in_progress'):
        time.sleep(info.get('check_after_secs', 2))
        st = f'https://api.x.com/2/media/upload?command=STATUS&media_id={mid}'
        info = jhttp('GET', st, None, x_auth('GET', st)).get('data', {}).get('processing_info')
    if info and info.get('state') == 'failed':
        raise Failed(f'X could not process the media: {info}')
    return mid


def x_post(item, media, live):
    p = item['post']
    if not live:
        return None, f"would post with {len(media)} file(s) and a {len(p.get('thread', []))}-reply thread: {p['text'][:80]}"
    ids = [x_upload(m['data'], m['type']) for m in media[:1]]
    tweets = 'https://api.x.com/2/tweets'
    first = jhttp('POST', tweets, {'text': p['text'], **({'media': {'media_ids': ids}} if ids else {})}, x_auth('POST', tweets))['data']['id']
    prev = first
    for t in p.get('thread', []):
        prev = jhttp('POST', tweets, {'text': t, 'reply': {'in_reply_to_tweet_id': prev}}, x_auth('POST', tweets))['data']['id']
    return f'https://x.com/i/web/status/{first}', first
