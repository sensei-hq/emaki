"""The poster's run loop, with the desk API and the networks stubbed: what it prints, what it reports, how it exits.

    python3 -B -m unittest discover -s packages/emaki-posting/spec -p 'test_*.py'
"""
import contextlib, io, json, os, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).absolute().parent.parent / 'poster'))
import post  # noqa: E402

ITEMS = [
    {'slug': 'a', 'channel': 'youtube', 'content_sha': 'sa', 'post': {'media': []}, 'media': []},
    {'slug': 'b', 'channel': 'x', 'content_sha': 'sb', 'post': {'media': []}, 'media': []},
    {'slug': 'c', 'channel': 'instagram_reel', 'content_sha': 'sc', 'post': {'media': []}, 'media': []},
]


def run(argv, posters, items=ITEMS, paused=False):
    calls = []

    def admin(method, path, data=None):
        calls.append((method, path, data))
        if path.endswith('/queue'):
            return {'today': '2026-11-20', 'paused': paused, 'items': items}
        return {'ok': True}

    out, links = io.StringIO(), []
    with mock.patch.object(post, 'admin', admin), mock.patch.object(post, 'fetch_media', lambda item: [{'slug': item['slug']}]), \
            mock.patch.dict(post.POSTERS, posters), mock.patch.object(post, 'record_link', lambda *a: links.append(a)), \
            mock.patch.object(sys, 'argv', ['post.py', *argv]), contextlib.redirect_stdout(out):
        with unittest.TestCase().assertRaises(SystemExit) as ex:
            post.main()
    return ex.exception.code, out.getvalue().splitlines(), calls, links


def ok(item, media, live):
    return (f"https://{item['slug']}", f"id-{item['slug']}") if live else (None, f"would post {item['slug']}")


def boom(item, media, live):
    raise post.Failed('no video staged')


def missing(item, media, live):
    raise KeyError('title')


class Main(unittest.TestCase):
    def test_dry_run_reports_dry_run_for_every_item(self):
        code, out, calls, links = run([], {'youtube': ok, 'x': ok, 'instagram_reel': ok})
        self.assertEqual(code, 0)
        self.assertEqual(out[0], '2026-11-20: on, 3 approved post(s) due · dry run')
        self.assertEqual(out[1:], ['  a · youtube: dry-run would post a', '  b · x: dry-run would post b', '  c · instagram_reel: dry-run would post c'])
        self.assertEqual(calls[0], ('GET', '/api/admin/queue', None))
        self.assertEqual(calls[1], ('POST', '/api/admin/posted', {'slug': 'a', 'channel': 'youtube', 'content_sha': 'sa', 'status': 'dry-run',
                                                                  'url': '', 'external_id': '', 'detail': 'would post a', 'run': post.RUN}))
        self.assertEqual(links, [])

    def test_live_posts_records_links_and_honours_only(self):
        code, out, calls, links = run(['--live', '--only', 'youtube,x'], {'youtube': ok, 'x': ok, 'instagram_reel': boom})
        self.assertEqual(code, 0)
        self.assertEqual(out[0], '2026-11-20: on, 3 approved post(s) due · LIVE')
        self.assertEqual(out[1:], ['  a · youtube: posted https://a', '  b · x: posted https://b'])
        self.assertEqual(calls[2], ('POST', '/api/admin/posted', {'slug': 'b', 'channel': 'x', 'content_sha': 'sb', 'status': 'posted',
                                                                  'url': 'https://b', 'external_id': 'id-b', 'detail': '', 'run': post.RUN}))
        self.assertEqual(len(calls), 3)
        self.assertEqual(links, [('a', 'youtube', 'https://a'), ('b', 'x', 'https://b')])

    def test_failures_are_reported_and_fail_the_run(self):
        code, out, calls, links = run(['--live'], {'youtube': boom, 'x': missing, 'instagram_reel': ok}, paused=True)
        self.assertEqual(code, 1)
        self.assertEqual(out[0], '2026-11-20: paused, 3 approved post(s) due · LIVE')
        self.assertEqual(out[1:], ['  a · youtube: FAILED no video staged', "  b · x: FAILED 'title'", '  c · instagram_reel: posted https://c'])
        self.assertEqual(calls[1], ('POST', '/api/admin/posted', {'slug': 'a', 'channel': 'youtube', 'content_sha': 'sa', 'status': 'failed',
                                                                  'detail': 'no video staged', 'run': post.RUN}))
        self.assertEqual(calls[2][2]['detail'], "'title'")
        self.assertEqual(links, [('c', 'instagram_reel', 'https://c')])

    def test_an_unknown_channel_counts_as_a_failure(self):
        code, out, _, _ = run([], {}, items=[{'slug': 'z', 'channel': 'tiktok', 'content_sha': 's', 'post': {'media': []}, 'media': []}])
        self.assertEqual(code, 1)
        self.assertEqual(out[1], "  z · tiktok: FAILED 'tiktok'")

    def test_an_empty_queue_exits_cleanly(self):
        code, out, calls, _ = run([], {}, items=[])
        self.assertEqual((code, out, len(calls)), (0, ['2026-11-20: on, 0 approved post(s) due · dry run'], 1))


class RecordLink(unittest.TestCase):
    def test_writes_the_first_link_per_network_only(self):
        with tempfile.TemporaryDirectory() as d:
            index = Path(d) / 'index.json'
            index.write_text(json.dumps([{'slug': 'a'}, {'slug': 'b', 'social': {'x': 'old'}}]))
            with mock.patch.object(post, 'INDEX', index):
                post.record_link('a', 'instagram_reel', 'https://ig/1')
                post.record_link('a', 'instagram_carousel', 'https://ig/2')
                post.record_link('b', 'x', 'https://x/new')
                post.record_link('a', 'youtube', '')
            self.assertEqual(json.loads(index.read_text()), [{'slug': 'a', 'social': {'instagram': 'https://ig/1'}}, {'slug': 'b', 'social': {'x': 'old'}}])
            self.assertTrue(index.read_text().endswith('\n'))


if __name__ == '__main__':
    unittest.main()
