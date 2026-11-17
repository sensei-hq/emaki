// Stand-in programs for the specs that shell out (ffmpeg, ffprobe, the offline voices, aws, gcloud, a python). Each is a
// shell script that appends "<name> <args>" to calls.log and does just enough of the real tool's job: ffmpeg writes
// its last argument, ffprobe prints $FAKE_DUR. Environment variables switch the failure paths on. The PATH the specs
// set holds these and `which` only, so no real tool on the machine is ever reached.
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPTS = {
	ffmpeg: `[ -n "$FAKE_FFMPEG_FAIL" ] && { echo "ffmpeg broke: $FAKE_FFMPEG_FAIL" >&2; exit 1; }
cat > /dev/null
for a; do last=$a; done
echo FAKE > "$last"`,
	ffprobe: `case "$*" in *codec_type*) echo "\${FAKE_STREAMS-audio}" ;; *) echo "\${FAKE_DUR:-2}" ;; esac`,
	say: `[ "$1 $2" = "-v ?" ] && { printf '%s\\n' "\${FAKE_SAY_VOICES:-Alex en_US # Hello
Monica es_ES # Hola}"; exit 0; }
echo AIFF > "$2"`,
	'espeak-ng': `case "$1" in --voices=*) printf 'Pty Language Age/Gender VoiceName\\n 5  en  M  english\\n'; exit 0 ;; esac
while [ $# -gt 0 ]; do [ "$1" = -w ] && out=$2; shift; done
echo WAV > "$out"`,
	piper: `cat > "$(dirname "$0")/piper.stdin"
while [ $# -gt 0 ]; do [ "$1" = --output_file ] && out=$2; shift; done
[ -n "$FAKE_PIPER_SILENT" ] || echo WAV > "$out"`,
	aws: `case "$2" in
describe-voices) echo '{"Voices":[{"Id":"Joanna","Gender":"Female"},{"Id":"Matthew","Gender":"Male"}]}' ;;
*) for a; do last=$a; done; echo MP3 > "$last" ;;
esac`,
	gcloud: 'echo "$FAKE_GCLOUD_TOKEN"',
	quiet: 'exit 3',
	where: '[ "$1" = ffmpeg ]',
	kokoropy: `[ "$2" = "import kokoro, soundfile" ] && exit \${FAKE_KOKORO_MISSING:-0}
cat > "$(dirname "$0")/kokoro.stdin"
printf '%s\\n' "$3" >> "$(dirname "$0")/kokoro.args"
out=$(printf '%s' "$3" | sed 's/.*"out":"\\([^"]*\\)".*/\\1/')
echo WAV > "$out"`
}

/** A folder of stand-ins and an empty one (just `which`); `use()` / `none()` put one of them alone on PATH. */
export function tools() {
	const root = mkdtempSync(join(tmpdir(), 'emaki-tools-'))
	const bin = join(root, 'bin'), bare = join(root, 'bare'), calls = join(root, 'calls.log')
	const whichPath = execFileSync('/bin/sh', ['-c', 'command -v which'], { encoding: 'utf-8' }).trim()
	for (const d of [bin, bare]) {
		mkdirSync(d)
		// `which` itself, so util.which() answers from this folder alone (on macOS the shell's is a builtin).
		symlinkSync(whichPath.startsWith('/') ? whichPath : '/usr/bin/which', join(d, 'which'))
	}
	for (const [name, body] of Object.entries(SCRIPTS)) {
		writeFileSync(join(bin, name), `#!/bin/sh\n[ "$1" = --warm ] && exit 0\nPATH=/bin:/usr/bin\necho "${name} $*" >> "${calls}"\n${body}\n`)
		chmodSync(join(bin, name), 0o755)
		// A new executable can take seconds to start the first time (macOS checks it); pay that here, not in a test.
		spawnSync(join(bin, name), ['--warm'])
	}
	const saved = process.env.PATH
	return {
		bin, root,
		use: () => { process.env.PATH = bin },
		none: () => { process.env.PATH = bare },
		restore: () => { process.env.PATH = saved },
		reset: () => rmSync(calls, { force: true }),
		ran: () => (existsSync(calls) ? readFileSync(calls, 'utf-8').trim().split('\n') : []),
		stdin: (name) => readFileSync(join(bin, `${name}.stdin`), 'utf-8'),
		remove: () => rmSync(root, { recursive: true, force: true })
	}
}
