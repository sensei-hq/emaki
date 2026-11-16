"""YouTube extras the poster needs after an upload: the caption track and the custom thumbnail. Stdlib only."""
import hashlib
import json
import os
import urllib.request


def http(method, url, body=None, headers=None, timeout=600):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, dict(r.headers), r.read()


def yt_upload_caption(token, video_id, srt):
    """English caption track (needs the youtube.force-ssl scope)."""
    boundary = 'cap' + hashlib.sha256(os.urandom(8)).hexdigest()[:16]
    body = (f'--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
            f'{json.dumps({"snippet": {"videoId": video_id, "language": "en", "name": "English"}})}\r\n'
            f'--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n').encode() + srt + f'\r\n--{boundary}--\r\n'.encode()
    http('POST', 'https://www.googleapis.com/upload/youtube/v3/captions?part=snippet', body,
         {'authorization': f'Bearer {token}', 'content-type': f'multipart/related; boundary={boundary}'})


def yt_set_thumbnail(token, video_id, jpg):
    """Custom thumbnail (needs youtube.force-ssl; the channel must be phone-verified)."""
    boundary = 'thm' + hashlib.sha256(os.urandom(8)).hexdigest()[:16]
    body = (f'--{boundary}\r\nContent-Type: image/jpeg\r\n\r\n').encode() + jpg + f'\r\n--{boundary}--\r\n'.encode()
    http('POST', f'https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={video_id}', body,
         {'authorization': f'Bearer {token}', 'content-type': f'multipart/related; boundary={boundary}'})


