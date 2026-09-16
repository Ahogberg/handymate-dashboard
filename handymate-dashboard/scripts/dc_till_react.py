#!/usr/bin/env python3
"""
dc_till_react.py — kompilerar en Design Component (.dc.html) till React.

VARFÖR SKRIPT OCH INTE HANDPORTERING
Säljgenomgången är 2 250 rader med 596 inline-stilar, 31 loopar och 51
villkor. En handportering hade (a) tagit en dag, (b) drivit isär från
designkällan nästa gång Andreas ändrar i kanvasen. Med ett skript är
källan kvar som källa: ändra .dc.html, kör om, granska diffen.

VARFÖR html.parser OCH INTE REGEXAR
Markupen är nästlad med sc-for/sc-if som strukturella element. Regexar på
nästlad markup går sönder tyst och fel — stdlib-parsern gör trädet rätt.

VAD DEN GÖR
  {{hole}}                  -> {v.hole}, eller loopvariabeln när den är i skop
  {{$index}}                -> loopens index
  <sc-for list="{{xs}}" as="x">  -> {(v.xs||[]).map((x, $index) => (<>...</>))}
  <sc-if value="{{c}}">     -> {c ? (<>...</>) : null}
  style="a:b"               -> style={{a:'b'}} (camelCase, --custom orört)
  class=/for=               -> className=/htmlFor=
  onClick="{{f}}"           -> onClick={f}
  hint-*                    -> slängs (kanvas-hintar, inte DOM)
  <helmet>                  -> CSS:en plockas ut separat och SKOPAS

VAD DEN INTE GÖR
  <dc-import> (finns inte i den här filen) och tweak-chipsen. Props läses
  ur data-props och blir vanliga React-props med samma defaultvärden.

Kör:  python3 scripts/dc_till_react.py <kalla.dc.html> <mal.jsx> <KomponentNamn>
"""
import html as htmlmod
import json
import re
import sys
from html.parser import HTMLParser

VOID = {'area','base','br','col','embed','hr','img','input','link','meta',
        'param','source','track','wbr'}
# SVG-attribut som React vill ha i camelCase
SVG_CAMEL = {
    'stroke-width':'strokeWidth','stroke-linecap':'strokeLinecap',
    'stroke-linejoin':'strokeLinejoin','stroke-dasharray':'strokeDasharray',
    'stroke-dashoffset':'strokeDashoffset','fill-rule':'fillRule',
    'clip-rule':'clipRule','stop-color':'stopColor','stop-opacity':'stopOpacity',
    'stroke-opacity':'strokeOpacity','fill-opacity':'fillOpacity',
    'text-anchor':'textAnchor','clip-path':'clipPath','xlink:href':'xlinkHref',
    'gradientunits':'gradientUnits','patternunits':'patternUnits',
    'viewbox':'viewBox','preserveaspectratio':'preserveAspectRatio',
}
HOLE = re.compile(r'\{\{\s*([^}]+?)\s*\}\}')

# html.parser gemenar attributnamn. React vill ha dem i camelCase — utan den
# här kartan blir onClick till onclick, vilket React tyst ignorerar: knappen
# renderas men gör ingenting. (Inventerat mot källan, inte gissat.)
GEMENA_TILL_REACT = {
    'onclick': 'onClick', 'onchange': 'onChange', 'onkeydown': 'onKeyDown',
    'oninput': 'onInput', 'onsubmit': 'onSubmit', 'onblur': 'onBlur',
    'onfocus': 'onFocus', 'onmouseenter': 'onMouseEnter',
    'onmouseleave': 'onMouseLeave', 'autocomplete': 'autoComplete',
    'viewbox': 'viewBox', 'pathlength': 'pathLength', 'tabindex': 'tabIndex',
    'maxlength': 'maxLength', 'inputmode': 'inputMode', 'readonly': 'readOnly',
    'colspan': 'colSpan', 'rowspan': 'rowSpan', 'srcset': 'srcSet',
    'crossorigin': 'crossOrigin', 'datetime': 'dateTime',
}

# style-hover/style-focus finns inte i DOM. De blir riktiga CSS-regler med en
# egen klass — annars tappar sidan varje hovringstillstånd, och det är 32 av
# dem, mest på knappar och kort.
HOVERREGLER = []


def js_str(s):
    return json.dumps(s, ensure_ascii=False)


def uttryck(path, skop):
    """En hole-sökväg -> JS-uttryck. Loopvariabler vinner över v.*."""
    path = path.strip()
    if path == '$index':
        return skop[-1][1] if skop else '$index'
    if path in ('true', 'false', 'null'):
        return path
    if re.fullmatch(r'-?\d+(\.\d+)?', path):
        return path
    rot = path.split('.')[0]
    for namn, idx in skop:
        if rot == namn:
            return path
        if rot == '$index':
            return idx
    return 'v.' + path


def text_till_jsx(text, skop):
    """Textnod -> JSX-barn. Hål blir uttryck, resten literal text."""
    ut = []
    pos = 0
    for m in HOLE.finditer(text):
        fore = text[pos:m.start()]
        if fore:
            ut.append(('text', fore))
        ut.append(('expr', uttryck(m.group(1), skop)))
        pos = m.end()
    rest = text[pos:]
    if rest:
        ut.append(('text', rest))
    bitar = []
    for slag, v in ut:
        if slag == 'expr':
            bitar.append('{' + v + '}')
        else:
            # Klammer i literal text måste ut ur JSX-syntaxen.
            if '{' in v or '}' in v:
                bitar.append('{' + js_str(v) + '}')
            else:
                bitar.append(v)
    return ''.join(bitar)


def css_nyckel(prop):
    prop = prop.strip()
    if prop.startswith('--'):
        return js_str(prop)
    delar = prop.split('-')
    return delar[0] + ''.join(d[:1].upper() + d[1:] for d in delar[1:])


def style_till_objekt(varde, skop):
    """"a:b;c:{{d}}" -> {a:'b',c:`${v.d}`} — hål blir mallsträngar."""
    poster = []
    for dekl in varde.split(';'):
        if ':' not in dekl:
            continue
        prop, val = dekl.split(':', 1)
        prop, val = prop.strip(), val.strip()
        if not prop or not val:
            continue
        if HOLE.search(val):
            mall = HOLE.sub(lambda m: '${' + uttryck(m.group(1), skop) + '}', val)
            poster.append(f'{css_nyckel(prop)}: `{mall}`')
        else:
            poster.append(f'{css_nyckel(prop)}: {js_str(val)}')
    return '{' + ', '.join(poster) + '}'


def attr_namn(namn):
    if namn in GEMENA_TILL_REACT:
        return GEMENA_TILL_REACT[namn]
    if namn == 'class':
        return 'className'
    if namn == 'for':
        return 'htmlFor'
    if namn in SVG_CAMEL:
        return SVG_CAMEL[namn]
    if namn.startswith('data-') or namn.startswith('aria-'):
        return namn
    if '-' in namn:
        delar = namn.split('-')
        return delar[0] + ''.join(d[:1].upper() + d[1:] for d in delar[1:])
    return namn


def hover_klass(varde, pseudo):
    """En style-hover/style-focus blir en CSS-regel med egen klass."""
    if not varde or not varde.strip():
        return None
    namn = f'hx{len(HOVERREGLER)}'
    HOVERREGLER.append(f'.hm-sx .{namn}:{pseudo}{{{varde.strip()}}}')
    return namn


def attr_till_jsx(namn, varde, skop):
    if namn.startswith('hint-') or namn == 'data-dc-script':
        return None
    if namn in ('style-hover', 'style-focus'):
        return None  # hanteras i emit(), som kan sätta className
    if varde is None:
        return attr_namn(namn)
    if namn == 'style':
        return f'style={{{style_till_objekt(varde, skop)}}}'
    hel = HOLE.fullmatch(varde.strip())
    if hel:
        return f'{attr_namn(namn)}={{{uttryck(hel.group(1), skop)}}}'
    if HOLE.search(varde):
        mall = HOLE.sub(lambda m: '${' + uttryck(m.group(1), skop) + '}', varde)
        return f'{attr_namn(namn)}={{`{mall}`}}'
    return f'{attr_namn(namn)}={js_str(varde)}'


class Nod:
    def __init__(self, tagg, attr):
        self.tagg = tagg
        self.attr = attr
        self.barn = []


class Byggare(HTMLParser):
    """Bygger ett träd. convert_charrefs=False så &quot; i attribut behålls."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rot = Nod('#rot', [])
        self.stack = [self.rot]

    def handle_starttag(self, tagg, attr):
        n = Nod(tagg, attr)
        self.stack[-1].barn.append(n)
        if tagg not in VOID:
            self.stack.append(n)

    def handle_startendtag(self, tagg, attr):
        self.stack[-1].barn.append(Nod(tagg, attr))

    def handle_endtag(self, tagg):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tagg == tagg:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].barn.append(('#text', data))

    def handle_comment(self, data):
        pass


def emit(nod, skop, niva=0):
    pad = '  ' * niva
    if isinstance(nod, tuple):
        t = nod[1]
        if not t.strip():
            return ''
        return pad + text_till_jsx(t.strip(), skop) + '\n'

    a = dict((k, v) for k, v in nod.attr)

    if nod.tagg == 'sc-for':
        lista = a.get('list', '')
        m = HOLE.fullmatch(lista.strip())
        uttr = uttryck(m.group(1), skop) if m else 'v.items'
        namn = a.get('as', 'item')
        idx = '$i' + str(len(skop))
        inre = skop + [(namn, idx)]
        kropp = ''.join(emit(b, inre, niva + 3) for b in nod.barn)
        return (f'{pad}{{({uttr} || []).map(({namn}, {idx}) => (\n'
                f'{pad}  <React.Fragment key={{{idx}}}>\n'
                f'{kropp}'
                f'{pad}  </React.Fragment>\n'
                f'{pad}))}}\n')

    if nod.tagg == 'sc-if':
        v = a.get('value', '')
        m = HOLE.fullmatch(v.strip())
        uttr = uttryck(m.group(1), skop) if m else 'false'
        kropp = ''.join(emit(b, skop, niva + 2) for b in nod.barn)
        return (f'{pad}{{({uttr}) ? (\n{pad}  <>\n{kropp}{pad}  </>\n'
                f'{pad}) : null}}\n')

    if nod.tagg in ('helmet', 'x-dc'):
        return ''.join(emit(b, skop, niva) for b in nod.barn)

    attrar = []
    klasser = []
    for k, v in nod.attr:
        if k == 'style-hover':
            kn = hover_klass(v, 'hover')
            if kn:
                klasser.append(kn)
            continue
        if k == 'style-focus':
            kn = hover_klass(v, 'focus')
            if kn:
                klasser.append(kn)
            continue
        bit = attr_till_jsx(k, v, skop)
        if bit:
            attrar.append(bit)
    if klasser:
        attrar.append('className=' + js_str(' '.join(klasser)))
    attr_txt = (' ' + ' '.join(attrar)) if attrar else ''

    if nod.tagg in VOID or not nod.barn:
        return f'{pad}<{nod.tagg}{attr_txt} />\n'
    kropp = ''.join(emit(b, skop, niva + 1) for b in nod.barn)
    return f'{pad}<{nod.tagg}{attr_txt}>\n{kropp}{pad}</{nod.tagg}>\n'


def skopa_css(css, klass):
    """Globala elementregler blir regler INUTI wrappern.

    Utan detta skulle `*`, `body`, `a`, `button`, `p` och `h1..h3` slå mot
    hela dashboarden. @keyframes och @media lämnas orörda på toppnivå.
    """
    ut = []
    i = 0
    while i < len(css):
        if css[i] == '@':
            # at-regel: kopiera hela blocket orört (keyframes/media)
            start = i
            djup = 0
            while i < len(css):
                if css[i] == '{':
                    djup += 1
                elif css[i] == '}':
                    djup -= 1
                    if djup == 0:
                        i += 1
                        break
                i += 1
            block = css[start:i]
            # @media-regler innehåller vanliga väljare — de måste skopas,
            # annars slår `*{animation-duration:1ms}` mot hela dashboarden.
            if block.lstrip().startswith('@media'):
                huvud, _, inre = block.partition('{')
                inre = inre.rstrip()
                if inre.endswith('}'):
                    inre = inre[:-1]
                block = huvud + '{' + skopa_css(inre, klass) + '}'
            ut.append(block)
            continue
        m = re.match(r'([^{@]+)\{([^}]*)\}', css[i:])
        if not m:
            i += 1
            continue
        valjare, kropp = m.group(1).strip(), m.group(2)
        nya = []
        for del_ in valjare.split(','):
            d = del_.strip()
            if not d:
                continue
            if d in ('html', 'body', 'html,body'):
                nya.append(f'{klass}')
            elif d == '*':
                nya.append(f'{klass} *')
            else:
                nya.append(f'{klass} {d}')
        unika = list(dict.fromkeys(nya))
        ut.append(', '.join(unika) + '{' + kropp + '}')
        i += m.end()
    return '\n'.join(ut)


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(2)
    kalla, mal, komponent = sys.argv[1], sys.argv[2], sys.argv[3]
    s = open(kalla, encoding='utf-8').read()

    m_markup = re.search(r'<x-dc>([\s\S]*?)</x-dc>', s)
    if not m_markup:
        sys.exit('hittade ingen <x-dc>-markup')
    markup = m_markup.group(1)

    m_helmet = re.search(r'<helmet>([\s\S]*?)</helmet>', markup)
    css = ''
    if m_helmet:
        m_style = re.search(r'<style>([\s\S]*?)</style>', m_helmet.group(1))
        css = m_style.group(1) if m_style else ''
        markup = markup.replace(m_helmet.group(0), '')

    m_script = re.search(r'<script[^>]*data-dc-script[^>]*>([\s\S]*?)</script>', s)
    if not m_script:
        sys.exit('hittade ingen data-dc-script')
    logik = m_script.group(1)

    m_props = re.search(r'data-props="([^"]*)"', s)
    props = {}
    if m_props:
        props = json.loads(htmlmod.unescape(m_props.group(1)))
    defaults = {k: v.get('default') for k, v in props.items() if isinstance(v, dict)}

    b = Byggare()
    b.feed(markup)
    jsx = ''.join(emit(n, [], 4) for n in b.rot.barn)

    klass = '.hm-sx'
    css_skopad = skopa_css(css.strip(), klass)

    if HOVERREGLER:
        css_skopad += '\n' + '\n'.join(HOVERREGLER)

    ut = f'''/* GENERERAD FIL — ändra inte här.
 *
 * Källa:  {kalla}
 * Kör om: python3 scripts/dc_till_react.py {kalla} {mal} {komponent}
 *
 * Designen ägs av .dc.html-filen. Ändrar Andreas i kanvasen byts källan
 * och skriptet körs om — den här filen är utdata, inte en kopia att
 * redigera. Logikklassen nedan är källans egen, orörd.
 */
'use client'
/* eslint-disable */
import React from 'react'
import {{ DCLogic }} from '@/lib/dc/runtime'
import './sales-tokens.css'

const CSS = {js_str(css_skopad)}

const DEFAULTS = {json.dumps(defaults, ensure_ascii=False)}

{logik.strip()}

export default class {komponent} extends Component {{
  // React fyller på defaults innan render — logikklassen läser this.props
  // precis som i kanvasen, och ingen behöver skriva om props på plats.
  static defaultProps = DEFAULTS

  render() {{
    const v = this.renderVals()
    return (
      <div className="hm-sx">
        <style>{{CSS}}</style>
{jsx}      </div>
    )
  }}
}}
'''
    open(mal, 'w', encoding='utf-8').write(ut)
    print(f'skrev {mal}: {len(jsx.splitlines())} JSX-rader, {len(css_skopad)} tecken CSS, '
          f'props: {list(defaults)}')


if __name__ == '__main__':
    main()
