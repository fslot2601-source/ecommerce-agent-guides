#!/usr/bin/env python3
"""Usage: generate.py INPUT_DIR --date YYYY-MM-DD --shop NAME --output NEW_DIR."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'src'))
from daily_report import ReportError, build_result, json_ready, load_folder, normalize, render_html, render_markdown


def export_pdf(html_path, output_path, chrome=None):
    """Optional local conversion. Validate one A4 page before reporting success."""
    try:
        from pypdf import PdfReader
    except ImportError:
        return {'status': 'unavailable', 'reason': 'PDF 校验需要 pypdf；可安装 requirements-pdf.txt，或浏览器打印 HTML。'}
    candidates = [chrome] if chrome else [shutil.which('google-chrome'), shutil.which('chromium'), shutil.which('chromium-browser'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', os.path.join(os.environ.get('PROGRAMFILES', ''), 'Google/Chrome/Application/chrome.exe'), os.path.join(os.environ.get('PROGRAMFILES(X86)', ''), 'Google/Chrome/Application/chrome.exe')]
    executable = next((str(Path(p).resolve()) for p in candidates if p and Path(p).is_file()), None)
    if not executable:
        return {'status': 'unavailable', 'reason': '未找到 Chrome / Chromium；可用 --chrome 指定，或浏览器打印 HTML。'}
    if output_path.exists():
        raise ReportError('PDF 输出已存在，拒绝覆盖。')
    with tempfile.TemporaryDirectory(prefix='store-daily-report-') as profile:
        args = [executable, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--no-pdf-header-footer', '--user-data-dir='+profile, '--print-to-pdf='+str(output_path), html_path.as_uri()]
        proc = None
        reason = 'PDF 导出超时或浏览器未成功输出；HTML 已保留，可直接打印。'
        try:
            proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=os.name != 'nt')
            deadline = time.monotonic()+35
            while time.monotonic() < deadline:
                if output_path.is_file():
                    try:
                        reader = PdfReader(output_path)
                        if len(reader.pages) != 1:
                            reason = 'PDF 超过一页，未交付该 PDF；请先缩短过长字段或调整版式后重试。'
                            break
                        page = reader.pages[0]
                        width, height = float(page.mediabox.width), float(page.mediabox.height)
                        if abs(width-595.28)>2 or abs(height-841.89)>2 or not page.extract_text().strip():
                            reason = 'PDF 不是有效的单页 A4 文字报告。'
                            break
                        return {'status': 'ready', 'file': output_path.name, 'pages': 1, 'size': 'A4'}
                    except (OSError, ValueError):
                        pass
                    except Exception:
                        # A writer may still be completing the PDF trailer.
                        pass
                if proc.poll() is not None and not output_path.exists():
                    break
                time.sleep(.25)
        except OSError as exc:
            reason = f'无法启动浏览器：{exc}；HTML 已保留。'
        finally:
            if proc is not None:
                try:
                    if os.name != 'nt':
                        os.killpg(proc.pid, signal.SIGTERM)
                    elif proc.poll() is None:
                        proc.terminate()
                    proc.wait(timeout=3)
                except (ProcessLookupError, subprocess.TimeoutExpired):
                    if proc.poll() is None:
                        proc.kill()
                        proc.wait(timeout=3)
        output_path.unlink(missing_ok=True)
        return {'status': 'unavailable', 'reason': reason}


def main(argv=None):
    parser = argparse.ArgumentParser(description='从用户提供的京东报表生成一页 A4 店铺经营日报。')
    parser.add_argument('input', type=Path, help='报表文件夹，支持 .xlsx 和 UTF-8/GB18030 CSV')
    parser.add_argument('--inspect', action='store_true', help='仅识别文件类型与日期，不生成日报')
    parser.add_argument('--date', help='业务日期 YYYY-MM-DD，不自动假设为昨天')
    parser.add_argument('--shop', help='报告显示店铺名')
    parser.add_argument('--output', type=Path, help='尚不存在的结果目录')
    parser.add_argument('--pdf', action='store_true', help='可选：本机 Chrome 导出并核对单页 A4 PDF')
    parser.add_argument('--chrome', help='可选：Chrome/Chromium 可执行文件路径')
    args = parser.parse_args(argv)
    try:
        raw, inventory = load_folder(args.input)
        if args.inspect:
            print(json.dumps({'files': inventory, 'supportedTypes': ['交易概况', '商品明细', '全站营销', '快车']}, ensure_ascii=False, indent=2))
            return 0
        if not args.date or not args.shop or not args.output:
            raise ReportError('生成日报需提供 --date、--shop 和 --output；可先用 --inspect 检查资料。')
        if len(args.shop.strip()) == 0 or len(args.shop) > 80 or '\n' in args.shop or '\r' in args.shop:
            raise ReportError('店铺名请使用不超过80字的单行名称。')
        result = build_result(normalize(raw), inventory, args.date, args.shop.strip())
        output = args.output.resolve()
        if output.exists():
            raise ReportError('输出目录已存在，拒绝覆盖。请使用新的目录。')
        # Fully validate input before writing anything.
        report_html, report_md = render_html(result), render_markdown(result)
        output.mkdir(parents=True, exist_ok=False)
        (output/'report.html').write_text(report_html, encoding='utf-8')
        (output/'report.md').write_text(report_md, encoding='utf-8')
        result['pdf'] = export_pdf(output/'report.html', output/'report.pdf', args.chrome) if args.pdf else {'status': 'not-requested'}
        (output/'result.json').write_text(json.dumps(json_ready(result), ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf-8')
        print(json.dumps({'output': str(output), 'html': str(output/'report.html'), 'pdf': result['pdf'], 'notices': result['notices']}, ensure_ascii=False, indent=2))
        return 0
    except (ReportError, OSError) as exc:
        print(f'日报未生成：{exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
