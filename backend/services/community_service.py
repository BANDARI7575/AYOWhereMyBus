"""Validated, plain-text community observations; never verified stop conditions."""
import re
import unicodedata

CATEGORIES = {
    'snow_ice': {'en': 'Snow or ice', 'es': 'Nieve o hielo'},
    'blocked_access': {'en': 'Blocked access', 'es': 'Acceso bloqueado'},
    'stop_damage': {'en': 'Damaged stop or sign', 'es': 'Parada o señal dañada'},
    'lighting': {'en': 'Lighting concern', 'es': 'Problema de iluminación'},
    'other': {'en': 'Other condition', 'es': 'Otra condición'},
}

NEARBY_STOP_LIMIT = 4096
NEARBY_BODY_LIMIT = 32 * 1024


def nearby_stop_ids(data):
    ids = data.get('stop_ids')
    if set(data) != {'stop_ids'} or not isinstance(ids, list) or len(ids) > NEARBY_STOP_LIMIT:
        raise ValueError('Expected a bounded list of stop IDs')
    if any(not isinstance(stop, str) or not re.fullmatch(r'[a-zA-Z0-9_.:-]{1,128}', stop) for stop in ids):
        raise ValueError('Invalid stop ID')
    return list(dict.fromkeys(ids))


def clean_comment(value, minimum=0):
    if not isinstance(value, str) or len(value) > 500:
        raise ValueError('Use up to 500 characters of plain text')
    value = unicodedata.normalize('NFKC', value)
    if any(unicodedata.category(c).startswith('C') and c not in '\n\r\t' for c in value):
        raise ValueError('Control characters are not allowed')
    value = ' '.join(value.split())
    if not minimum <= len(value) <= 500:
        raise ValueError('Use 10–500 characters of plain text' if minimum else 'Use up to 500 characters of plain text')
    if ('<' in value or '>' in value or re.search(r'https?\s*:|www\.|\b\S+@\S+\.\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|edu|gov|io|co|us|info|biz)\b', value, re.I)):
        raise ValueError('Do not include HTML, links, email addresses or phone numbers')
    if any(sum(c.isdigit() for c in match.group()) >= 10 for match in re.finditer(r'\+?\d[\d ().-]{7,}\d', value)):
        raise ValueError('Do not include HTML, links, email addresses or phone numbers')
    return value


def report_fields(data):
    stop = data.get('stop_id')
    if isinstance(stop, bool) or not isinstance(stop, (str, int)):
        raise ValueError('Choose a valid stop')
    stop = str(stop).strip()
    if not 1 <= len(stop) <= 128:
        raise ValueError('Choose a valid stop')
    if 'category' in data or 'comment' in data:
        if set(data) - {'stop_id', 'category', 'comment'}:
            raise ValueError('Unexpected report fields')
        category = data.get('category')
        if not isinstance(category, str) or category not in CATEGORIES:
            raise ValueError('Choose a valid report category')
        comment = clean_comment(data.get('comment', ''))
    else:
        # Preserve the already-supported text-only API for older clients.
        if set(data) - {'stop_id', 'text'}:
            raise ValueError('Unexpected report fields')
        category, comment = 'other', clean_comment(data.get('text', ''), minimum=10)
    return stop, category, comment
