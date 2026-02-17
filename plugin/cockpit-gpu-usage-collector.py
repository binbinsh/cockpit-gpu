#!/usr/bin/env python3
import argparse
import csv
import json
import os
import subprocess
import sys
import tempfile
import time

DAY_MS = 24 * 60 * 60 * 1000
USAGE_MAX_DAYS = 30
USAGE_MAX_INTERVAL_MS = 2000
USAGE_BUCKET_MS = 60 * 60 * 1000
USAGE_SUMMARY_VERSION = 3
USAGE_STORAGE_DIR = '/var/lib/cockpit/gpus'
USAGE_STORAGE_PATH = os.path.join(USAGE_STORAGE_DIR, 'usage-summary.json')


def create_usage_summary_state(now_ms=None):
    now = int(time.time() * 1000) if now_ms is None else int(now_ms)
    return {
        'version': USAGE_SUMMARY_VERSION,
        'updatedAt': now,
        'collectorEnabled': True,
        'gpus': {},
    }


def parse_number(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text or text == 'N/A':
        return None

    if text.endswith('%'):
        text = text[:-1].strip()

    try:
        return float(text)
    except ValueError:
        return None


def create_usage_bucket():
    return {
        'sum': 0,
        'count': 0,
        'activeSum': 0,
        'sampleMs': 0,
        'activeMs': 0,
        'spanMs': USAGE_BUCKET_MS,
        'utilizationMemorySum': 0,
        'utilizationMemoryCount': 0,
        'temperatureSum': 0,
        'temperatureCount': 0,
    }


def to_int_ms(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def day_key(time_ms):
    return int(time_ms // DAY_MS) * DAY_MS


def usage_bucket_key(time_ms):
    return int(int(time_ms) // USAGE_BUCKET_MS) * USAGE_BUCKET_MS


def create_usage_bucket_profile():
    return {
        'id': None,
        'index': None,
        'name': None,
        'days': {},
        'lastSampleTs': None,
        'updatedAt': None,
    }


def parse_usage_summary_state(raw):
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None

    if not isinstance(payload, dict):
        return None
    if not isinstance(payload.get('gpus'), dict):
        return None

    return {
        'version': USAGE_SUMMARY_VERSION,
        'updatedAt': to_int_ms(payload.get('updatedAt')) or int(time.time() * 1000),
        'collectorEnabled': payload.get('collectorEnabled') is True,
        'gpus': payload.get('gpus'),
    }


def load_usage_summary():
    if not os.path.exists(USAGE_STORAGE_PATH):
        return create_usage_summary_state()

    try:
        with open(USAGE_STORAGE_PATH, 'r', encoding='utf-8') as fd:
            parsed = parse_usage_summary_state(fd.read())
    except OSError:
        parsed = None

    return parsed or create_usage_summary_state()


def write_usage_summary(state):
    os.makedirs(USAGE_STORAGE_DIR, exist_ok=True)
    payload = state.copy()
    payload['updatedAt'] = int(time.time() * 1000)

    with tempfile.NamedTemporaryFile(
        mode='w',
        dir=USAGE_STORAGE_DIR,
        prefix='.usage-summary',
        suffix='.tmp',
        delete=False,
        encoding='utf-8',
    ) as fd:
        json.dump(payload, fd, ensure_ascii=False)
        tmp = fd.name

    os.replace(tmp, USAGE_STORAGE_PATH)


def safe_write_usage_summary(state):
    try:
        write_usage_summary(state)
    except OSError as error:
        print(f'failed to write usage summary: {error}', file=sys.stderr)


def prune_usage_summary(state, now_ms):
    cutoff = day_key(now_ms - (USAGE_MAX_DAYS * DAY_MS))
    gpus = state.get('gpus', {})
    for gpu_profile in gpus.values():
        days = gpu_profile.get('days')
        if not isinstance(days, dict):
            continue

        for key in list(days.keys()):
            key_ts = to_int_ms(key)
            if key_ts is None or key_ts < cutoff:
                del days[key]


def collect_gpu_samples():
    command = [
        'nvidia-smi',
        '--query-gpu=index,uuid,name,utilization.gpu,utilization.memory,memory.total,memory.used,temperature.gpu',
        '--format=csv,noheader,nounits',
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, 'LC_ALL': 'C'},
            timeout=5,
        )
    except OSError:
        return []

    if result.returncode != 0:
        return []

    output = (result.stdout or '').strip()
    if not output:
        return []

    samples = []
    for row in csv.reader(output.splitlines()):
        if len(row) < 4:
            continue

        index = f"{row[0]}".strip()
        uuid = f"{row[1]}".strip() if len(row) > 1 else ''
        gpu_id = uuid or index
        if not gpu_id:
            continue

        name = f"{row[2]}".strip() if len(row) > 2 else ''
        utilization_gpu = parse_number(row[3]) if len(row) > 3 else None
        utilization_memory = parse_number(row[4]) if len(row) > 4 else None
        memory_total = parse_number(row[5]) if len(row) > 5 else None
        memory_used = parse_number(row[6]) if len(row) > 6 else None
        memory_utilization = None

        if utilization_memory is None:
            if (
                memory_total is not None
                and memory_total > 0
                and memory_used is not None
            ):
                memory_utilization = (memory_used / memory_total) * 100
        else:
            memory_utilization = utilization_memory

        temperature = parse_number(row[7]) if len(row) > 7 else None

        samples.append({
            'id': gpu_id,
            'index': index,
            'name': name,
            'utilizationGpu': utilization_gpu,
            'utilizationMemory': memory_utilization,
            'temperature': temperature,
        })

    return samples


def update_usage_summary(prev_state, samples, now_ms, fallback_interval_ms):
    state = {
        'version': prev_state.get('version', USAGE_SUMMARY_VERSION),
        'updatedAt': int(now_ms),
        'collectorEnabled': True,
        'gpus': {},
    }
    state['gpus'] = prev_state.get('gpus', {})
    bucket = usage_bucket_key(now_ms)
    if not isinstance(state['gpus'], dict):
        state['gpus'] = {}

    interval_ms = max(1, int(fallback_interval_ms))
    bucket_profiles = state['gpus']

    for sample in samples:
        utilization_gpu = sample.get('utilizationGpu')
        utilization_memory = sample.get('utilizationMemory')
        temperature = sample.get('temperature')

        if utilization_gpu is None and utilization_memory is None and temperature is None:
            continue

        gpu_id = sample.get('id')
        if not gpu_id:
            continue

        previous_profile = bucket_profiles.get(gpu_id) if isinstance(bucket_profiles.get(gpu_id), dict) else None
        last_sample_ms = previous_profile.get('lastSampleTs') if isinstance(previous_profile, dict) else None
        if isinstance(last_sample_ms, int) and now_ms > last_sample_ms:
            safe_sample_ms = min(now_ms - last_sample_ms, interval_ms * 3)
        else:
            safe_sample_ms = interval_ms

        if not safe_sample_ms or safe_sample_ms <= 0:
            safe_sample_ms = interval_ms

        profile = previous_profile or create_usage_bucket_profile()
        profile['id'] = gpu_id
        profile['index'] = sample.get('index')
        profile['name'] = sample.get('name') or gpu_id
        profile['updatedAt'] = int(now_ms)
        profile['lastSampleTs'] = int(now_ms)

        days = profile.get('days')
        if not isinstance(days, dict):
            days = {}
            profile['days'] = days

        bucket_entry = days.get(str(bucket))
        if not isinstance(bucket_entry, dict):
            bucket_entry = create_usage_bucket()
        bucket_entry['spanMs'] = bucket_entry.get('spanMs', USAGE_BUCKET_MS)

        if isinstance(utilization_gpu, (int, float)):
            bucket_entry['sum'] += utilization_gpu
            bucket_entry['count'] += 1
            bucket_entry['activeSum'] += utilization_gpu * safe_sample_ms
            bucket_entry['activeMs'] += safe_sample_ms
        if isinstance(utilization_memory, (int, float)):
            bucket_entry['utilizationMemorySum'] += utilization_memory
            bucket_entry['utilizationMemoryCount'] += 1
        if isinstance(temperature, (int, float)):
            bucket_entry['temperatureSum'] += temperature
            bucket_entry['temperatureCount'] += 1

        bucket_entry['sampleMs'] += safe_sample_ms
        days[str(bucket)] = bucket_entry
        bucket_profiles[gpu_id] = profile

    prune_usage_summary(state, now_ms)
    return state


def run_loop(interval_seconds, once):
    interval_ms = int(max(1, interval_seconds * 1000))
    state = load_usage_summary()
    state['version'] = USAGE_SUMMARY_VERSION
    state['collectorEnabled'] = True

    while True:
        start_ms = int(time.time() * 1000)
        samples = collect_gpu_samples()
        if samples:
            state = update_usage_summary(state, samples, start_ms, interval_ms)
        state['updatedAt'] = start_ms
        prune_usage_summary(state, start_ms)
        safe_write_usage_summary(state)

        if once:
            break

        elapsed_ms = int(time.time() * 1000) - start_ms
        sleep_ms = interval_ms - elapsed_ms
        if sleep_ms > 0:
            time.sleep(sleep_ms / 1000)


def main():
    parser = argparse.ArgumentParser(description='Collect NVIDIA GPU usage summary in background.')
    parser.add_argument('--interval', type=float, default=USAGE_MAX_INTERVAL_MS / 1000, help='Collection interval in seconds')
    parser.add_argument('--once', action='store_true', help='Collect once and exit')
    args = parser.parse_args()

    interval_seconds = max(0.5, float(args.interval))
    os.environ['LC_ALL'] = 'C'

    run_loop(interval_seconds=interval_seconds, once=args.once)


if __name__ == '__main__':
    main()
