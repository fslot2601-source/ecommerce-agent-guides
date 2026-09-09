"""JD exported files -> bounded one-page daily report. No network or database."""
from __future__ import annotations

import csv
import hashlib
import html
import io
import json
import math
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path


class ReportError(ValueError):
    pass


EMPTY = (None, '', '-', '—', '--')
SIGNATURES = {
    'shop': {'时间', '店铺访客数', '成交金额', '成交单量'},
    'product': {'时间', '商品ID', '商品名称', '成交金额'},
    'full': {'日期', 'ID', '投放类型', '花费', '全站交易额'},
    'quick': {'日期', '跟单SKU ID', '计划ID', '花费', '总订单金额'},
}
LABELS = {'shop': '交易概况', 'product': '商品明细', 'full': '全站营销', 'quick': '快车'}


def parse_date(value):
    if isinstance(value, (datetime, date)):
        return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
    value = str(value).strip()
    for fmt in ('%Y-%m-%d', '%Y%m%d', '%Y/%m/%d', '%Y.%m.%d'):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    raise ReportError(f'日期格式无法识别：{value}；请使用 YYYY-MM-DD。')


def number(value, label, required=True, count=False):
    if value in EMPTY:
        if required:
            raise ReportError(f'{label} 缺失；不能以零代替。')
        return None
    if isinstance(value, bool):
        raise ReportError(f'{label} 必须是数字。')
    try:
        result = Decimal(str(value).replace(',', '').strip())
    except InvalidOperation:
        raise ReportError(f'{label} 不是有效数字：{value}') from None
    if not result.is_finite() or result < 0 or (count and result != result.to_integral_value()):
        raise ReportError(f'{label} 必须为有限非负' + ('整数。' if count else '数字。'))
    return result


def identifier(value, label):
    # Excel numeric identifiers beyond exact integer precision are unsafe to join.
    if value in EMPTY or isinstance(value, bool):
        raise ReportError(f'{label} 缺失。')
    if isinstance(value, (float, int)):
        if not math.isfinite(value) or value != int(value) or abs(value) >= 10**15:
            raise ReportError(f'{label} 请以文本导出，避免编号精度丢失。')
        return str(int(value))
    text = str(value).strip()
    if not text:
        raise ReportError(f'{label} 缺失。')
    return text


def ratio(a, b):
    return None if a is None or b is None or b == 0 else a / b


def change(a, b):
    return None if a is None or b is None or b == 0 else a / b - 1


def total(rows, key):
    return sum((r[key] for r in rows), Decimal(0))


def optional_total(rows, key):
    return total(rows, key) if rows and all(r.get(key) is not None for r in rows) else None


def read_tables(path):
    if path.suffix.lower() == '.csv':
        raw = path.read_bytes()
        for encoding in ('utf-8-sig', 'gb18030', 'utf-16'):
            try:
                text = raw.decode(encoding)
                break
            except UnicodeError:
                continue
        else:
            raise ReportError(f'{path.name} 编码无法读取，请导出 UTF-8 CSV。')
        yield path.name, list(csv.reader(io.StringIO(text)))
    else:
        try:
            from openpyxl import load_workbook
        except ImportError:
            raise ReportError('读取 Excel 需要 openpyxl：python -m pip install -r requirements.txt') from None
        try:
            workbook = load_workbook(path, read_only=True, data_only=True)
            try:
                for sheet in workbook:
                    # JD exports can incorrectly declare A1:A1 while containing full data.
                    sheet.reset_dimensions()
                    yield sheet.title, list(sheet.values)
            finally:
                workbook.close()
        except (OSError, ValueError) as exc:
            raise ReportError(f'无法读取 {path.name}：{exc}') from None


def load_folder(folder):
    folder = Path(folder)
    if not folder.is_dir():
        raise ReportError('输入必须是包含 Excel / CSV 的文件夹。')
    inventory, rows, seen_hashes = [], defaultdict(list), set()
    for path in sorted(folder.iterdir()):
        if not path.is_file() or path.name.startswith('~$') or path.suffix.lower() not in ('.csv', '.xlsx'):
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest in seen_hashes:
            inventory.append({'file': path.name, 'kind': 'duplicate-file', 'rows': 0, 'dates': []})
            continue
        seen_hashes.add(digest)
        for sheet, matrix in read_tables(path):
            detected = None
            for header_index, raw in enumerate(matrix[:20]):
                headers = [str(x).strip() if x is not None else '' for x in raw]
                for kind, signature in SIGNATURES.items():
                    if signature.issubset(headers):
                        detected = kind, header_index, headers
                        break
                if detected:
                    break
            if not detected:
                inventory.append({'file': path.name, 'sheet': sheet, 'kind': 'unsupported', 'rows': 0, 'dates': []})
                continue
            kind, index, headers = detected
            meaningful = [h for h in headers if h]
            if len(meaningful) != len(set(meaningful)):
                raise ReportError(f'{path.name} / {sheet} 存在重复列名，请修正后重试。')
            count, dates = 0, set()
            for row_number, values in enumerate(matrix[index+1:], index+2):
                if not any(v not in EMPTY for v in values):
                    continue
                row = dict(zip(headers, values))
                raw_day = row.get('时间' if kind in ('shop', 'product') else '日期')
                # Explicit aggregate rows are excluded; malformed dated detail rows are not.
                if raw_day in ('合计', '总计', '汇总') or (raw_day in EMPTY and row.get('商品ID') in ('合计', '总计')):
                    continue
                day = parse_date(raw_day)
                row['_date'] = day
                row['_source'] = f'{path.name} / {sheet} / 第{row_number}行'
                rows[kind].append(row)
                dates.add(day)
                count += 1
            inventory.append({'file': path.name, 'sheet': sheet, 'kind': kind, 'rows': count, 'dates': sorted(dates), 'sha256': digest})
    return dict(rows), inventory


def normalize(raw):
    result, seen = defaultdict(list), {}
    for kind, rows in raw.items():
        for row in rows:
            where = row['_source']
            def n(key, required=True, count=False):
                return number(row.get(key), f'{where} 的 {key}', required, count)
            item = {'date': row['_date']}
            if kind == 'shop':
                item.update(sales=n('成交金额'), orders=n('成交单量', count=True), units=n('成交商品件数', False, True), buyers=n('成交客户数', False, True), visitors=n('店铺访客数', False, True))
                item['conversion'] = ratio(item['buyers'], item['visitors'])
                item['customer_value'] = ratio(item['sales'], item['buyers'])
                key = kind, item['date']
            elif kind == 'product':
                sku = identifier(row.get('商品ID'), where+' 商品ID')
                name = str(row.get('商品名称') or '').strip()
                if not name:
                    raise ReportError(where+' 商品名称缺失。')
                item.update(id=sku, name=name, sales=n('成交金额'), orders=n('成交单量', False, True), units=n('成交商品件数', False, True))
                key = kind, item['date'], sku
            else:
                full = kind == 'full'
                id_key, name_key = ('ID', '商品计划名称') if full else ('跟单SKU ID', '跟单SKU名称')
                item.update(id=identifier(row.get(id_key), where+' '+id_key), name=str(row.get(name_key) or row.get('推广计划') or '').strip(), spend=n('花费'), revenue=n('全站交易额' if full else '总订单金额'), orders=n('全站订单行' if full else '总订单行', False, True))
                if not item['name']:
                    raise ReportError(where+' 商品或计划名称缺失。')
                item['grain'] = str(row.get('投放类型', 'SKU')).strip().upper()
                if item['grain'] not in ('SKU', 'SPU'):
                    raise ReportError(where+' 投放类型只支持 SKU / SPU。')
                item['plan'] = identifier(row.get('计划ID'), where+' 计划ID') if not full else item['id']
                key = kind, item['date'], item['grain'], item['id'], item['plan']
            if key in seen:
                # Ambiguous overlaps stop before totals can be double counted.
                raise ReportError(f'{where} 与已有报表重复：{key}。请只保留一份同日期同粒度报表。')
            seen[key] = where
            result[kind].append(item)
    return dict(result)


def build_result(data, inventory, day, shop_name):
    day = parse_date(day)
    previous = (date.fromisoformat(day)-timedelta(days=1)).isoformat()
    week = (date.fromisoformat(day)-timedelta(days=7)).isoformat()
    def selected(kind, at=day):
        return [r for r in data.get(kind, []) if r['date'] == at]
    current = selected('shop')
    if not current:
        raise ReportError(f'缺少 {day} 的交易概况（至少含成交金额、成交单量），请补充对应日报。')
    shop = dict(current[0])
    prior = selected('shop', previous)
    weekly = selected('shop', week)
    shop['sales_change'] = change(shop['sales'], prior[0]['sales']) if prior else None
    shop['orders_change'] = change(shop['orders'], prior[0]['orders']) if prior else None
    shop['sales_week_change'] = change(shop['sales'], weekly[0]['sales']) if weekly else None
    channels, focus, notices, quick = [], [], [], {}
    known = []
    for kind in ('full', 'quick'):
        records = selected(kind)
        if not records:
            notices.append(f'{LABELS[kind]}当日数据未提供，不按零投放计算。')
            continue
        prior_ad = selected(kind, previous)
        c = {'id': kind, 'name': LABELS[kind], 'spend': total(records, 'spend'), 'revenue': total(records, 'revenue'), 'orders': optional_total(records, 'orders')}
        c['roi'] = ratio(c['revenue'], c['spend'])
        c['spend_change'] = change(c['spend'], total(prior_ad, 'spend')) if prior_ad else None
        c['revenue_change'] = change(c['revenue'], total(prior_ad, 'revenue')) if prior_ad else None
        c['previous_roi'] = ratio(total(prior_ad, 'revenue'), total(prior_ad, 'spend')) if prior_ad else None
        channels.append(c)
        by_id = defaultdict(list)
        for r in records:
            by_id[(r['grain'], r['id'])].append(r)
        grouped = []
        for (grain, product_id), rs in by_id.items():
            g = {'id': product_id, 'name': rs[0]['name'], 'grain': grain, 'channel': LABELS[kind], 'spend': total(rs, 'spend'), 'revenue': total(rs, 'revenue')}
            g['roi'] = ratio(g['revenue'], g['spend'])
            grouped.append(g)
            if kind == 'quick':
                quick[product_id] = g
        focus.extend(sorted(grouped, key=lambda x: (-x['spend'], x['id']))[:2])
        known.append(kind)
    shop['spend'] = sum((c['spend'] for c in channels), Decimal(0)) if channels else None
    shop['spend_ratio'] = ratio(shop['spend'], shop['sales'])
    shop['spend_change'] = change(shop['spend'], sum((total(selected(k, previous), 'spend') for k in known), Decimal(0))) if known and all(selected(k, previous) for k in known) else None
    shop['spend_label'] = '两类推广花费' if len(channels) == 2 else (channels[0]['name']+'花费' if channels else '推广花费')
    products = sorted(selected('product'), key=lambda x: (-x['sales'], x['id']))
    product_total = total(products, 'sales') if products else None
    coverage = ratio(product_total, shop['sales'])
    gap = shop['sales']-product_total if product_total is not None else None
    if gap is not None and abs(gap) >= Decimal('0.01'):
        notices.append(f'商品明细合计{money(product_total)}元，与店铺差额{money(gap)}元；排行仅代表已提供明细。')
    if not products:
        notices.append('未提供当日商品明细，无法生成销售排行。')
    unmatched_quick = set(quick)-{p['id'] for p in products}
    if unmatched_quick:
        notices.append(f'{len(unmatched_quick)}个快车SKU未匹配销售明细，推广独立展示。')
    for p in products:
        ad = quick.get(p['id'])
        p['quick_spend'] = ad['spend'] if ad else None
        p['quick_roi'] = ad['roi'] if ad else None
    if not prior:
        notices.append('缺少前日交易概况，销售环比暂缺。')
    all_spu = any(r['grain'] == 'SPU' for r in selected('full'))
    if all_spu:
        notices.append('全站营销SPU未映射到销售SKU，保持独立展示。')
    attention = '暂无可比较的推广变化；补充前日同口径报表后再判断。'
    comparable = [c for c in channels if c['revenue_change'] is not None and c['spend_change'] is not None]
    if comparable:
        c = max(comparable, key=lambda x: abs(x['revenue_change']))
        attention = f'{c["name"]}报表交易额较前日{percent(c["revenue_change"], signed=True)}，花费{percent(c["spend_change"], signed=True)}，投产比{money(c["roi"])}（前日{money(c["previous_roi"])}）。先结合归因回流与多日表现复查。'
    return {'schemaVersion': 1, 'date': day, 'shopName': shop_name, 'shop': shop, 'channels': channels, 'topProducts': products[:5], 'promotionFocus': focus, 'attention': attention, 'notices': notices, 'coverage': coverage, 'salesGap': gap, 'inputFiles': inventory, 'counts': {'products': len(products), 'matchedQuickSkus': len(set(quick)&{p['id'] for p in products})}, 'definitions': ['金额单位为元；成交额沿用交易概况，不减退款或计算利润。', '推广花费只含已提供的全站营销与快车，不含佣金及补贴券。', '不同推广报表归因交易额不能相加，也不等于该SKU自身成交。', '缺失或零分母显示—；无记录不等于零。']}


def money(value):
    return '—' if value is None else f'{value:,.2f}'


def integer(value):
    return '—' if value is None else f'{value:,.0f}'


def percent(value, signed=False):
    return '—' if value is None else (f'{value:+.2%}' if signed else f'{value:.2%}')


def json_ready(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: json_ready(v) for k, v in value.items()}
    if isinstance(value, list):
        return [json_ready(v) for v in value]
    return value


def short_name(value, limit=26):
    value = html.unescape(value)
    value = re.sub(r'【[^】]*】|\[[^\]]*\]', '', value)
    value = re.sub(r'\s+', ' ', value).strip()
    return value[:limit-1]+'…' if len(value) > limit else value


def render_html(result):
    e = lambda v: html.escape(str(v), quote=True)
    shop = result['shop']
    def name_cell(r):
        return f'<span title="{e(r["name"])} · {e(r["id"])}">{e(short_name(r["name"]))}</span>'
    channel_rows = ''.join(f'<tr><td>{e(c["name"])}</td><td>{money(c["spend"])}</td><td>{percent(c["spend_change"], True)}</td><td>{money(c["revenue"])}</td><td>{money(c["roi"])}</td><td>{money(c["previous_roi"])}</td></tr>' for c in result['channels']) or '<tr><td colspan="6">未提供当日推广报表</td></tr>'
    product_rows = ''.join(f'<tr><td><b>{i:02}</b> {name_cell(r)}</td><td>{money(r["sales"])}</td><td>{integer(r["orders"])}</td><td>{integer(r["units"])}</td><td>{money(r["quick_spend"])}</td><td>{money(r["quick_roi"])}</td></tr>' for i, r in enumerate(result['topProducts'], 1)) or '<tr><td colspan="6">未提供当日商品明细</td></tr>'
    focus_rows = ''.join(f'<tr><td>{e(r["channel"])} · {r["grain"]}</td><td>{name_cell(r)}</td><td>{money(r["spend"])}</td><td>{money(r["roi"])}</td></tr>' for r in result['promotionFocus']) or '<tr><td colspan="4">未提供当日推广报表</td></tr>'
    # Keep only material, compact caveats on paper; full list stays in result.json.
    footer = []
    if result['salesGap'] is not None and abs(result['salesGap']) >= Decimal('.01'):
        footer.append(f'商品明细与店铺差额{money(result["salesGap"])}元；排行仅代表所提供明细。')
    if result['counts']['products'] == 0:
        footer.append('商品明细暂缺。')
    if len(result['channels']) < 2:
        footer.append('推广费比仅按已提供渠道计算，未提供渠道不填零。')
    if result['shop']['sales_change'] is None:
        footer.append('销售历史对比暂缺或前日为零。')
    footer.append('来源：用户提供的京东导出报表；推广不含联盟佣金等费用。')
    template = (Path(__file__).parent/'report.html').read_text(encoding='utf-8')
    replacements = {'title': e(short_name(result['shopName'], 22))+' · 经营日报', 'date': e(result['date']), 'sales': money(shop['sales']), 'orders': integer(shop['orders']), 'units': integer(shop['units']), 'sales_change': percent(shop['sales_change'], True), 'spend_label': e(shop['spend_label']), 'spend': money(shop['spend']), 'spend_change': percent(shop['spend_change'], True), 'spend_ratio': percent(shop['spend_ratio']), 'visitors': integer(shop['visitors']), 'conversion': percent(shop['conversion']), 'customer_value': money(shop['customer_value']), 'channel_rows': channel_rows, 'product_rows': product_rows, 'focus_rows': focus_rows, 'attention': e(result['attention']), 'footer': '<br>'.join(e(t) for t in footer)}
    return re.sub(r'\{\{([a-z_]+)\}\}', lambda match: replacements[match.group(1)], template)


def render_markdown(result):
    s = result['shop']
    lines = [f'# {result["shopName"]} · {result["date"]} 经营日报', '', '| 指标 | 当日 |', '| --- | ---: |', f'| 成交金额 | {money(s["sales"])} 元 |', f'| 成交单量 | {integer(s["orders"])} 单 |', f'| {s["spend_label"]} | {money(s["spend"])} 元 |', f'| 已提供渠道推广费比 | {percent(s["spend_ratio"])} |', '', '## 店铺推广', '', '| 渠道 | 花费（元） | 报表交易额（元） | 投产比 |', '| --- | ---: | ---: | ---: |']
    for c in result['channels']:
        lines.append(f'| {c["name"]} | {money(c["spend"])} | {money(c["revenue"])} | {money(c["roi"])} |')
    lines.extend(['', '## 当日关注', '', result['attention'], '', 'A4 HTML 包含销售前5商品与各渠道花费前2商品。', '', '## 数据说明', ''])
    lines.extend('- '+n for n in result['notices']+result['definitions'])
    return '\n'.join(lines)+'\n'
