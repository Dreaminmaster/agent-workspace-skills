#!/usr/bin/env python3
"""Copy the sanitized single-owner starter into an empty workspace. No secrets/network."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit


def origin(value):
    u = urlsplit(value)
    if u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('', '/'):
        raise argparse.ArgumentTypeError('Use an HTTPS origin without credentials, path or query')
    if not re.fullmatch(r'[a-zA-Z0-9.-]+', u.hostname) or u.port not in (None, 443):
        raise argparse.ArgumentTypeError('Use a plain HTTPS DNS origin')
    return 'https://' + u.hostname.lower()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--site-origin', type=origin, required=True)
    p.add_argument('--browser-origin', type=origin, required=True)
    p.add_argument('--canvas-user-id', required=True)
    p.add_argument('--canvas-origin', type=origin, default='https://canvas.sydney.edu.au')
    p.add_argument('--sso-origin', type=origin, default='https://sso.sydney.edu.au')
    p.add_argument('--account-id', help='Optional non-secret Cloudflare account resource ID')
    args = p.parse_args()
    if not re.fullmatch(r'[1-9][0-9]*', args.canvas_user_id):
        p.error('--canvas-user-id must be your numeric Canvas profile ID')
    if args.account_id and not re.fullmatch(r'[a-fA-F0-9]{32}', args.account_id):
        p.error('--account-id must be a 32-character hexadecimal resource ID')
    out = args.output.resolve()
    if out.exists() and (not out.is_dir() or any(out.iterdir())):
        p.error('Output must be absent or empty; existing files are never overwritten')
    source = Path(__file__).resolve().parents[1] / 'assets' / 'cloud-starter'
    replacements = {
        'https://canvas-study.example.chatgpt.site': args.site_origin,
        'https://canvas-browser.example.workers.dev': args.browser_origin,
        'https://canvas.sydney.edu.au': args.canvas_origin,
        'canvas.sydney.edu.au': urlsplit(args.canvas_origin).hostname,
        'https://sso.sydney.edu.au': args.sso_origin,
        'sso.sydney.edu.au': urlsplit(args.sso_origin).hostname,
        'REPLACE_WITH_YOUR_CANVAS_USER_ID': args.canvas_user_id,
    }
    for f in source.rglob('*'):
        if not f.is_file():
            continue
        relative = f.relative_to(source)
        if not (f.suffix == '.mjs' or f.name in ('package.json', 'package-lock.json', 'wrangler.jsonc', '.gitignore', 'hosting.json')):
            raise RuntimeError('Unexpected template file: ' + str(relative))
        text = f.read_text()
        for old, new in replacements.items():
            text = text.replace(old, new)
        target = out / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
    config = out / 'cloud-browser' / 'wrangler.jsonc'
    data = json.loads(config.read_text())
    if args.account_id:
        data['account_id'] = args.account_id
    config.write_text(json.dumps(data, indent=2) + '\n')
    print('Starter created at', out)
    print('No credentials copied. Register an owner-private Site and configure Secrets before live calls.')
    print('For another institution, review SSO, asset-domain and read-only policies before deployment.')


if __name__ == '__main__':
    main()
