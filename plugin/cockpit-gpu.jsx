/*
 * Copyright (C) 2026
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import '../lib/patternfly/patternfly-6-cockpit.scss';
import 'polyfills';
import 'cockpit-dark-theme';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import cockpit from 'cockpit';

import { Alert, AlertVariant } from '@patternfly/react-core/dist/esm/components/Alert/index.js';
import { Button } from '@patternfly/react-core/dist/esm/components/Button/index.js';
import { Card, CardBody, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card/index.js';
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from '@patternfly/react-core/dist/esm/components/DescriptionList/index.js';
import { Flex, FlexItem } from '@patternfly/react-core/dist/esm/layouts/Flex/index.js';
import { Grid, GridItem } from '@patternfly/react-core/dist/esm/layouts/Grid/index.js';
import { Badge } from '@patternfly/react-core/dist/esm/components/Badge/index.js';
import { Progress } from '@patternfly/react-core/dist/esm/components/Progress/index.js';
import { Spinner } from '@patternfly/react-core/dist/esm/components/Spinner/index.js';
import { Tabs, Tab, TabTitleText } from '@patternfly/react-core/dist/esm/components/Tabs/index.js';
import { EmptyStatePanel } from 'cockpit-components-empty-state.jsx';
import { Table, Thead, Tbody, Td, Th, Tr, TableVariant } from '@patternfly/react-table';

import './cockpit-gpu.scss';

const _ = cockpit.gettext;

const POLL_INTERVAL_MS = 2000;
const HISTORY_WINDOW_MS = 10 * 60 * 1000;
const MAX_HISTORY_POINTS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE_MAX_DAYS = 400;
const USAGE_ACTIVE_THRESHOLD = 0;
const USAGE_BUCKET_MS = 60 * 60 * 1000;
const USAGE_SUMMARY_VERSION = 3;
const USAGE_STORAGE_DIR = '/var/lib/cockpit/gpus';
const USAGE_STORAGE_PATH = `${USAGE_STORAGE_DIR}/usage-summary.json`;
const USAGE_WINDOW_DAY = DAY_MS;
const USAGE_WINDOW_WEEK = 7 * DAY_MS;
const USAGE_WINDOW_MONTH = 30 * DAY_MS;
const APP_VERSION = (() => {
    const manifestVersion = cockpit?.manifests?.gpus?.version;
    if (typeof manifestVersion === 'string' && manifestVersion.trim().length > 0)
        return manifestVersion.trim();
    return 'dev';
})();

const GPU_QUERY_FIELDS = [
    { field: 'index', key: 'index' },
    { field: 'name', key: 'name' },
    { field: 'uuid', key: 'uuid' },
    { field: 'pci.bus_id', key: 'pcibusid' },
    { field: 'utilization.gpu', key: 'utilizationGpu' },
    { field: 'utilization.memory', key: 'utilizationMemory' },
    { field: 'memory.total', key: 'memoryTotal' },
    { field: 'memory.used', key: 'memoryUsed' },
    { field: 'memory.free', key: 'memoryFree' },
    { field: 'temperature.gpu', key: 'temperature' },
    { field: 'fan.speed', key: 'fanSpeed' },
    { field: 'power.draw', key: 'powerDraw' },
    { field: 'power.limit', key: 'powerLimit' },
];

const GPU_QUERY_FIELDS_EXT_CORE = [
    { field: 'index', key: 'index' },
    { field: 'uuid', key: 'uuid' },
    { field: 'clocks.current.graphics', key: 'clockGraphics' },
    { field: 'clocks.current.sm', key: 'clockSm' },
    { field: 'clocks.current.memory', key: 'clockMemory' },
    { field: 'clocks.current.video', key: 'clockVideo' },
    { field: 'pcie.link.gen.current', key: 'pcieGen' },
    { field: 'pcie.link.width.current', key: 'pcieWidth' },
];

const GPU_QUERY_FIELDS_EXT_LIMITS = [
    { field: 'index', key: 'index' },
    { field: 'uuid', key: 'uuid' },
    { field: 'clocks.max.graphics', key: 'clockMaxGraphics' },
    { field: 'clocks.max.sm', key: 'clockMaxSm' },
    { field: 'power.min_limit', key: 'powerMinLimit' },
    { field: 'power.default_limit', key: 'powerDefaultLimit' },
];

const GPU_QUERY_FIELDS_EXT_PCIE_LIMIT = [
    { field: 'index', key: 'index' },
    { field: 'uuid', key: 'uuid' },
    { field: 'pcie.link.gen.max', key: 'pcieGenMax' },
    { field: 'pcie.link.width.max', key: 'pcieWidthMax' },
];

const GPU_QUERY_FIELDS_EXT_TEMP_MAX = [
    { field: 'index', key: 'index' },
    { field: 'uuid', key: 'uuid' },
    { field: 'temperature.gpu.tlimit', key: 'temperatureMaxThreshold' },
];

const GPU_QUERY_FIELDS_EXT_TEMP_MAX_LEGACY = [
    { field: 'index', key: 'index' },
    { field: 'uuid', key: 'uuid' },
    { field: 'temperature.gpu.maxthreshold', key: 'temperatureMaxThreshold' },
];

const GPU_QUERY_FIELDS_EXT_TEMP_MEMORY = [
    { field: 'index', key: 'index' },
    { field: 'uuid', key: 'uuid' },
    { field: 'temperature.memory', key: 'memoryTemperature' },
];

const GPU_QUERY_FIELDS_EXT_TEMP_AMBIENT = [
    { field: 'index', key: 'index' },
    { field: 'uuid', key: 'uuid' },
    { field: 'temperature.ambient', key: 'temperatureAmbient' },
];

const CHART_PURPLE_100 = '#c4b5fd';
const CHART_PURPLE_200 = '#a855f7';
const CHART_PURPLE_300 = '#8b5cf6';

const GPU_QUERY_FIELDS_ESSENTIAL = [
    { field: 'index', key: 'index' },
    { field: 'uuid', key: 'uuid' },
    { field: 'clocks.current.sm', key: 'clockSm' },
    { field: 'clocks.max.sm', key: 'clockMaxSm' },
    { field: 'pcie.link.gen.current', key: 'pcieGen' },
    { field: 'pcie.link.width.current', key: 'pcieWidth' },
    { field: 'pcie.link.gen.max', key: 'pcieGenMax' },
    { field: 'pcie.link.width.max', key: 'pcieWidthMax' },
];

const GPU_QUERY_FIELDS_EXT_PRIMARY = [
    { field: 'index', key: 'index' },
    { field: 'uuid', key: 'uuid' },
    { field: 'clocks.current.sm', key: 'clockSm' },
    { field: 'clocks.max.sm', key: 'clockMaxSm' },
    { field: 'pcie.link.gen.current', key: 'pcieGen' },
    { field: 'pcie.link.width.current', key: 'pcieWidth' },
    { field: 'pcie.link.gen.max', key: 'pcieGenMax' },
    { field: 'pcie.link.width.max', key: 'pcieWidthMax' },
    { field: 'temperature.gpu.tlimit', key: 'temperatureMaxThreshold' },
    { field: 'power.min_limit', key: 'powerMinLimit' },
    { field: 'power.default_limit', key: 'powerDefaultLimit' },
    { field: 'temperature.memory', key: 'memoryTemperature' },
];

const GPU_QUERY_FIELDS_EXT_PCIE_THROUGHPUT = [
    [
        { field: 'index', key: 'index' },
        { field: 'uuid', key: 'uuid' },
        { field: 'pcie.tx_throughput', key: 'pcieTxThroughput' },
        { field: 'pcie.rx_throughput', key: 'pcieRxThroughput' },
    ],
    [
        { field: 'index', key: 'index' },
        { field: 'uuid', key: 'uuid' },
        { field: 'pcie.throughput.tx', key: 'pcieTxThroughput' },
        { field: 'pcie.throughput.rx', key: 'pcieRxThroughput' },
    ],
    [
        { field: 'index', key: 'index' },
        { field: 'uuid', key: 'uuid' },
        { field: 'pcie.tx.util', key: 'pcieTxThroughput' },
        { field: 'pcie.rx.util', key: 'pcieRxThroughput' },
    ],
];

let pcieThroughputQueryProfile = null;
const PROCESS_QUERY_FIELDS = [
    [
        { field: 'pid', key: 'pid' },
        { field: 'process_name', key: 'name' },
        { field: 'used_memory', key: 'usedMemory' },
    ],
    [
        { field: 'pid', key: 'pid' },
        { field: 'name', key: 'name' },
        { field: 'used_memory', key: 'usedMemory' },
    ],
    [
        { field: 'pid', key: 'pid' },
        { field: 'process_name', key: 'name' },
    ],
    [
        { field: 'pid', key: 'pid' },
        { field: 'name', key: 'name' },
    ],
    [
        { field: 'pid', key: 'pid' },
        { field: 'used_memory', key: 'usedMemory' },
    ],
    [
        { field: 'pid', key: 'pid' },
        { field: 'process_name', key: 'name' },
        { field: 'type', key: 'type' },
        { field: 'used_memory', key: 'usedMemory' },
        { field: 'gpu_uuid', key: 'gpuUuid' },
    ],
    [
        { field: 'pid', key: 'pid' },
        { field: 'process_name', key: 'name' },
        { field: 'type', key: 'type' },
        { field: 'used_memory', key: 'usedMemory' },
        { field: 'gpu_name', key: 'gpuName' },
    ],
    [
        { field: 'pid', key: 'pid' },
        { field: 'name', key: 'name' },
        { field: 'type', key: 'type' },
        { field: 'used_memory', key: 'usedMemory' },
        { field: 'gpu_bus_id', key: 'gpuBusId' },
    ],
    [
        { field: 'pid', key: 'pid' },
        { field: 'name', key: 'name' },
        { field: 'type', key: 'type' },
        { field: 'used_gpu_memory', key: 'usedMemory' },
        { field: 'gpu_name', key: 'gpuName' },
    ],
    [
        { field: 'pid', key: 'pid' },
        { field: 'command', key: 'name' },
        { field: 'type', key: 'type' },
        { field: 'used_memory', key: 'usedMemory' },
    ],
    [
        { field: 'pid', key: 'pid' },
        { field: 'command', key: 'name' },
        { field: 'type', key: 'type' },
        { field: 'used_gpu_memory', key: 'usedMemory' },
        { field: 'gpu_name', key: 'gpuName' },
    ],
    [
        { field: 'process_id', key: 'pid' },
        { field: 'process_name', key: 'name' },
        { field: 'type', key: 'type' },
        { field: 'used_memory', key: 'usedMemory' },
    ],
    [
        { field: 'pid', key: 'pid' },
        { field: 'used_memory', key: 'usedMemory' },
    ],
    [
        { field: 'pid', key: 'pid' },
    ],
];

function parseCsvLine(line) {
    const values = [];
    let token = '';
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            quoted = !quoted;
            continue;
        }

        if (ch === ',' && !quoted) {
            values.push(token);
            token = '';
            continue;
        }

        token += ch;
    }

    values.push(token);
    return values.map(v => v.trim().replace(/""/g, '"').trim());
}

function extractPid(value) {
    const rawPid = `${value || ''}`.trim();
    if (!rawPid)
        return null;

    const matched = rawPid.match(/-?\d+/);
    if (!matched)
        return null;

    const pid = parseInt(matched[0], 10);
    return Number.isFinite(pid) ? pid : null;
}

function pickProcessField(row, keys) {
    for (const key of keys) {
        const value = row[`${key}`];
        if (value === undefined || value === null)
            continue;

        const text = `${value}`.trim();
        if (!text || text === 'N/A' || text === '[Not Supported]')
            continue;
        return text;
    }

    return '';
}

function normalizeProcessEntry(partial) {
    if (!partial || !Number.isFinite(partial.pid) || partial.pid <= 0)
        return null;

    const rawUsedMemoryMiB = partial.usedMemoryMiB;
    const usedMemoryMiB = Number.isFinite(rawUsedMemoryMiB)
        ? rawUsedMemoryMiB
        : Number.isFinite(toNumber(partial.usedMemory))
            ? toNumber(partial.usedMemory)
            : toMemoryMiB(partial.usedMemory);
    const processName = `${partial.processName || partial.name || _('Unknown process')}`.trim() || _('Unknown process');
    const type = canonicalizeProcessType(partial.type);
    const gpuBusId = normalizeGpuBusId(partial.gpuBusId || partial.gpuBus || partial.gpu_bus_id || partial.gpuName);
    const gpuUuid = normalizeGpuUuid(partial.gpuUuid || partial.gpu_uuid || partial.gpuName);

    return {
        pid: partial.pid,
        type,
        gpuName: normalizeProcessGpuName(partial.gpuName),
        gpuBusId,
        gpuUuid,
        processName,
        usedMemoryMiB,
    };
}

function normalizeProcessTypeChars(type) {
    const text = `${type || ''}`.toUpperCase();
    const chars = [];
    for (const ch of text) {
        if ((ch === 'C' || ch === 'G') && !chars.includes(ch))
            chars.push(ch);
    }
    return chars;
}

function canonicalizeProcessType(rawType) {
    const text = `${rawType || ''}`.toUpperCase().replace(/[^A-Z+]/g, '');
    const chars = normalizeProcessTypeChars(text);
    if (chars.includes('C') && chars.includes('G'))
        return 'C+G';
    if (chars.includes('C'))
        return 'C';
    if (chars.includes('G'))
        return 'G';

    if (/^U$/i.test(`${text}`))
        return 'U';

    const fallback = text.match(/[A-Z]/);
    return fallback ? `${fallback[0]}` : 'C';
}

function mergeProcessType(currentType, nextType) {
    const chars = normalizeProcessTypeChars(`${currentType || ''}`.concat(`${nextType || ''}`));
    if (chars.includes('C') && chars.includes('G'))
        return 'C+G';
    if (chars.includes('C'))
        return 'C';
    if (chars.includes('G'))
        return 'G';
    return chars[0] || 'C';
}

function normalizeProcessGpuName(rawName) {
    const name = `${rawName || ''}`.trim();
    if (!name)
        return '';
    return name.replace(/\s+/g, ' ').trim();
}

function normalizeGpuBusId(rawValue) {
    const text = `${rawValue || ''}`.trim();
    if (!text)
        return '';

    const match = text.match(/([0-9A-Fa-f]{4,8}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}\.[0-9])/);
    return match ? `${match[1]}`.toUpperCase() : '';
}

function normalizeGpuUuid(rawValue) {
    const text = `${rawValue || ''}`.trim();
    if (!text)
        return '';

    const match = text.match(/(GPU-[0-9A-Fa-f-]+)/i);
    return match ? `${match[1]}`.toUpperCase() : '';
}

function normalizeGpuNameLookupKey(rawValue) {
    return normalizeProcessGpuName(rawValue).toLowerCase();
}

function buildGpuLookup(gpus) {
    const byId = new Map();
    const byUuid = new Map();
    const byBusId = new Map();
    const byIndex = new Map();
    const byName = new Map();
    const nameCount = new Map();

    for (const gpu of Array.isArray(gpus) ? gpus : []) {
        if (!gpu || !gpu.id)
            continue;

        byId.set(gpu.id, gpu);

        const uuidKey = normalizeGpuUuid(gpu.uuid);
        if (uuidKey)
            byUuid.set(uuidKey, gpu);

        const busKey = normalizeGpuBusId(gpu.pcibusid);
        if (busKey)
            byBusId.set(busKey, gpu);

        const indexKey = `${gpu.index || ''}`.trim();
        if (indexKey)
            byIndex.set(indexKey, gpu);

        const nameKey = normalizeGpuNameLookupKey(gpu.name);
        if (nameKey) {
            byName.set(nameKey, gpu);
            nameCount.set(nameKey, (nameCount.get(nameKey) || 0) + 1);
        }
    }

    return { byId, byUuid, byBusId, byIndex, byName, nameCount };
}

function resolveProcessGpu(proc, lookup) {
    if (!proc || !lookup)
        return null;

    const uuidKey = normalizeGpuUuid(proc.gpuUuid || proc.gpuName);
    if (uuidKey && lookup.byUuid.has(uuidKey))
        return lookup.byUuid.get(uuidKey);

    const busKey = normalizeGpuBusId(proc.gpuBusId || proc.gpuName);
    if (busKey && lookup.byBusId.has(busKey))
        return lookup.byBusId.get(busKey);

    const rawName = `${proc.gpuName || ''}`.trim();
    if (rawName) {
        const idxFromLabel = rawName.match(/^(?:GPU\s*)?(\d+)$/i);
        if (idxFromLabel && lookup.byIndex.has(`${idxFromLabel[1]}`))
            return lookup.byIndex.get(`${idxFromLabel[1]}`);
    }

    const nameKey = normalizeGpuNameLookupKey(rawName);
    if (nameKey && lookup.nameCount.get(nameKey) === 1 && lookup.byName.has(nameKey))
        return lookup.byName.get(nameKey);

    return null;
}

function dedupeProcesses(processes) {
    const seen = new Map();
    const list = [];

    for (const proc of processes) {
        const norm = normalizeProcessEntry(proc);
        if (!norm)
            continue;

        const key = `${norm.pid}|${norm.gpuUuid || norm.gpuBusId || norm.gpuName || ''}`;
        const existing = seen.get(key);
        if (existing === undefined) {
            seen.set(key, norm);
            list.push(norm);
            continue;
        }

        existing.type = mergeProcessType(existing.type, norm.type);
        const currentMem = existing.usedMemoryMiB;
        const newMem = norm.usedMemoryMiB;
        if (Number.isFinite(newMem) && (!Number.isFinite(currentMem) || newMem > currentMem))
            existing.usedMemoryMiB = newMem;
        if (existing.processName === _('Unknown process') && norm.processName !== _('Unknown process'))
            existing.processName = norm.processName;
        if (!existing.gpuBusId && norm.gpuBusId)
            existing.gpuBusId = norm.gpuBusId;
        if (!existing.gpuUuid && norm.gpuUuid)
            existing.gpuUuid = norm.gpuUuid;
        if (!existing.gpuName && norm.gpuName)
            existing.gpuName = norm.gpuName;
    }

    return list;
}

function normalizeProcessRows(processes, gpus = []) {
    const lookup = buildGpuLookup(gpus);
    const rows = [];
    const seen = new Map();
    const NA = _('N/A');

    for (const proc of (Array.isArray(processes) ? processes : [])) {
        const pid = Number.isFinite(proc?.pid) && proc.pid > 0 ? proc.pid : extractPid(proc?.pid);
        if (!proc || !Number.isFinite(pid) || pid <= 0)
            continue;

        const normalized = normalizeProcessEntry({
            ...proc,
            pid,
        });
        if (!normalized)
            continue;

        const resolvedGpu = resolveProcessGpu(normalized, lookup);
        const resolvedGpuName = resolvedGpu
            ? `${resolvedGpu.name || _('GPU')}${resolvedGpu.pcibusid ? ` (${resolvedGpu.pcibusid})` : ''}`
            : '';
        const fallbackGpuName = normalized.gpuName || normalized.gpuBusId || normalized.gpuUuid || '';
        const displayGpuName = resolvedGpuName || fallbackGpuName || NA;
        const gpuKey = resolvedGpu?.id
            || normalized.gpuUuid
            || normalized.gpuBusId
            || normalizeGpuNameLookupKey(fallbackGpuName)
            || 'unknown';
        const dedupeKey = `${pid}|${gpuKey}`;

        let row = seen.get(dedupeKey);

        if (!row && !resolvedGpu) {
            const alias = rows.find(existing =>
                existing.pid === pid
                && existing.processName === normalized.processName
                && (existing.gpuId || existing.gpuName !== NA)
                && (
                    !Number.isFinite(normalized.usedMemoryMiB)
                    || !Number.isFinite(existing.usedMemoryMiB)
                    || Math.abs(existing.usedMemoryMiB - normalized.usedMemoryMiB) < 1
                )
            );
            if (alias)
                row = alias;
        }

        if (!row) {
            row = {
                pid,
                gpuId: resolvedGpu?.id || '',
                gpuName: displayGpuName,
                type: normalized.type || _('Compute'),
                processName: normalized.processName || _('Unknown process'),
                usedMemoryMiB: Number.isFinite(normalized.usedMemoryMiB) ? normalized.usedMemoryMiB : null,
            };
            seen.set(dedupeKey, row);
            rows.push(row);
            continue;
        }

        row.type = mergeProcessType(row.type, normalized.type);
        const newMem = normalized.usedMemoryMiB;
        if (Number.isFinite(newMem) && (!Number.isFinite(row.usedMemoryMiB) || newMem > row.usedMemoryMiB))
            row.usedMemoryMiB = newMem;
        if (row.processName === _('Unknown process') && normalized.processName !== _('Unknown process'))
            row.processName = normalized.processName;
        if ((row.gpuName === NA || !row.gpuName) && displayGpuName && displayGpuName !== NA)
            row.gpuName = displayGpuName;
    }

    return rows;
}

function parseComputeAppsCsv(lines, selectedFields) {
    return lines.map(line => {
        const values = parseCsvLine(line);
        if (!values.length)
            return null;

        if (values.length < selectedFields.length) {
            return {
                pid: extractPid(values[0]),
                processName: values.length > 1 ? values[1] : '',
                usedMemory: values.length > 2 ? values[2] : '',
            };
        }

        const row = {};

        for (let i = 0; i < selectedFields.length && i < values.length; i++)
            row[selectedFields[i].key] = values[i];

        const pid = parseInt(`${row.pid || ''}`, 10);
        const processName = pickProcessField(row, ['name', 'processName', 'process_name', 'command', 'command_name']);
        const type = pickProcessField(row, ['type', 'processType']);
        const usedMemory = pickProcessField(row, ['usedMemory', 'used_memory', 'used_gpu_memory', 'usedMemoryMiB', 'memoryUsed', 'memory_used']);
        const usedMemoryMiB = Number.isFinite(toNumber(usedMemory)) ? toNumber(usedMemory) : toMemoryMiB(usedMemory);
        const gpuUuid = pickProcessField(row, ['gpuUuid', 'gpu_uuid', 'gpuUuidRaw']);
        const gpuBusId = pickProcessField(row, ['gpuBusId', 'gpu_bus_id', 'gpuBus']);
        let gpuName = pickProcessField(row, ['gpuName', 'gpu_name', 'gpu_name_raw', 'gpuId', 'gpuIdRaw', 'gpu']);
        if (!gpuName)
            gpuName = gpuUuid || gpuBusId;
        const parsedPid = Number.isFinite(pid) ? pid : extractPid(row.pid);
        return {
            pid: parsedPid,
            type,
            gpuName,
            gpuUuid,
            gpuBusId,
            processName,
            usedMemory,
            usedMemoryMiB,
        };    
    }).filter(proc => Number.isFinite(proc.pid) && proc.pid > 0);
}

function parseComputeAppsResult(out, selectedFields) {
    const trimmed = `${out || ''}`.trim();
    if (!trimmed || isNoDeviceOutput(trimmed))
        return [];

    const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(line => line.length);
    if (lines.length === 0)
        return [];

    const parsed = parseComputeAppsCsv(lines, selectedFields);
    return dedupeProcesses(parsed);
}

function toNumber(value) {
    if (value === null || value === undefined)
        return null;

    const text = `${value}`.trim();
    if (!text || text === 'N/A' || text === '[Not Supported]')
        return null;

    const num = Number(text);
    return Number.isFinite(num) ? num : null;
}

function toNumberWithUnit(value) {
    if (value === null || value === undefined)
        return null;

    const text = `${value}`.trim();
    if (!text || text === 'N/A' || text === '[Not Supported]')
        return null;

    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match)
        return null;

    const num = Number(match[0]);
    return Number.isFinite(num) ? num : null;
}

function toMemoryMiB(value) {
    if (value === null || value === undefined)
        return null;

    const text = `${value}`.trim();
    if (!text || text === 'N/A' || text === '[Not Supported]')
        return null;

    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match)
        return null;

    const num = Number(match[0]);
    if (!Number.isFinite(num))
        return null;

    if (/GiB|GB\b/i.test(text))
        return num * 1024;
    if (/KiB|KB\b/i.test(text))
        return num / 1024;

    return num;
}

function findFirstTagByName(parent, tagName) {
    if (!parent || !parent.getElementsByTagName)
        return null;

    const exact = parent.getElementsByTagName(tagName);
    if (exact && exact.length)
        return exact[0];

    const target = `${tagName || ''}`.toLowerCase();
    for (const node of parent.getElementsByTagName('*')) {
        if (`${node.tagName || ''}`.toLowerCase() === target)
            return node;
    }

    return null;
}

function findAllTagsByName(parent, tagName) {
    if (!parent || !parent.getElementsByTagName)
        return [];

    const exact = parent.getElementsByTagName(tagName);
    if (exact && exact.length)
        return Array.from(exact);

    const target = `${tagName || ''}`.toLowerCase();
    const matched = [];
    for (const node of parent.getElementsByTagName('*')) {
        if (`${node.tagName || ''}`.toLowerCase() === target)
            matched.push(node);
    }

    return matched;
}

function getElementText(parent, tagName) {
    const names = Array.isArray(tagName) ? tagName : [tagName];
    for (const name of names) {
        const segments = `${name || ''}`.split('/').map(s => s.trim()).filter(Boolean);
        if (!parent || !segments.length)
            continue;

        let node = parent;
        let found = null;
        for (const segment of segments) {
            const nodeMatch = findFirstTagByName(node, segment);
            if (!nodeMatch) {
                found = null;
                break;
            }

            found = nodeMatch;
            node = found;
        }

        if (!found)
            continue;

        return `${found.textContent || ''}`.trim();

    }
    return null;
}

function getTagValue(text, tagName) {
    const names = Array.isArray(tagName) ? tagName : [tagName];

    for (const name of names) {
        if (!name)
            continue;

        const escaped = `${name}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`<\\s*${escaped}\\s*>([\\s\\S]*?)<\\s*/\\s*${escaped}\\s*>`, 'i');
        const match = `${text || ''}`.match(pattern);
        if (match)
            return `${match[1] || ''}`.trim();
    }

    return null;
}

function parseProcessesFromGpuXmlBlock(block, fallbackGpuName = '') {
    const gpuName = (
        getTagValue(block, ['product_name', 'product']) ||
        getTagValue(block, 'name') ||
        fallbackGpuName ||
        ''
    ).trim();
    const processBlocks = `${block || ''}`.match(/<\s*process(?:_info)?\s*>[\s\S]*?<\s*\/\s*process(?:_info)?\s*>/gi);
    if (!processBlocks || !processBlocks.length)
        return [];

    const list = [];
    for (const processBlock of processBlocks) {
        const pid = parseInt(`${(
            getTagValue(processBlock, 'pid') ||
            getTagValue(processBlock, 'process_id') ||
            getTagValue(processBlock, 'processid')
        ) || ''}`, 10);
        if (!Number.isFinite(pid) || pid <= 0)
            continue;

        const usedMemoryMiB = toNumberWithUnit(
            getTagValue(processBlock, ['used_memory', 'used_memory_mib']) ||
            getTagValue(processBlock, ['used_gpu_memory', 'used_gpu_mem']) ||
            getTagValue(processBlock, 'memory_used')
        );
        const processName = getTagValue(processBlock, ['process_name', 'process_name_raw', 'process']) ||
            getTagValue(processBlock, 'name');
        const type = getTagValue(processBlock, 'type') || 'C';

        list.push({
            pid,
            type,
            gpuName,
            processName: processName || _('Unknown process'),
            usedMemoryMiB,
        });
    }

    return list;
}

function isNoDeviceOutput(text) {
    return /^No devices found|No devices were found|No such files|No running processes found/i.test(text || '');
}

function deriveGpuId(index, uuid) {
    const safeIndex = `${index || ''}`.trim();
    const safeUuid = `${uuid || ''}`.trim();

    return safeUuid || safeIndex;
}

function dayKey(timeMs) {
    const current = new Date(timeMs);
    current.setHours(0, 0, 0, 0);
    return current.getTime();
}

function usageBucketKey(timeMs) {
    const now = Number(timeMs);
    if (!Number.isFinite(now))
        return null;
    return Math.floor(now / USAGE_BUCKET_MS) * USAGE_BUCKET_MS;
}

function formatDayLabel(timeMs) {
    const current = new Date(timeMs);
    return current.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function calcSeriesStats(values) {
    const finite = values.filter(v => Number.isFinite(v));
    if (finite.length === 0)
        return null;

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    for (const value of finite) {
        if (value < min)
            min = value;
        if (value > max)
            max = value;
        sum += value;
    }

    return {
        min,
        max,
        avg: sum / finite.length,
    };
}

function formatUsagePercent(value) {
    return value == null ? _('N/A') : formatPercent(value);
}

function calculatePcieBandwidthMbps(gen, width) {
    const knownGenGbps = {
        1: 2,
        2: 4,
        3: 8,
        3.0: 8,
        4: 16,
        4.0: 16,
        5: 32,
        5.0: 32,
        6: 64,
        6.0: 64,
    };

    if (!Number.isFinite(gen) || !Number.isFinite(width))
        return null;

    const perLane = knownGenGbps[gen];
    if (!Number.isFinite(perLane))
        return null;

    return perLane * width;
}

function createUsageSummaryState() {
    return {
        version: USAGE_SUMMARY_VERSION,
        updatedAt: Date.now(),
        gpus: {},
    };
}

function parseUsageSummaryState(raw) {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.version !== USAGE_SUMMARY_VERSION || !parsed.gpus)
        return null;

    return {
        version: USAGE_SUMMARY_VERSION,
        updatedAt: Number(parsed.updatedAt) || Date.now(),
        gpus: parsed.gpus,
    };
}

function readUsageSummaryFromEngineStorage() {
    if (typeof cockpit?.file !== 'function')
        return Promise.resolve(null);

    return cockpit
        .file(USAGE_STORAGE_PATH, { superuser: 'try' })
        .read()
        .then(raw => {
            const text = `${raw || ''}`;
            if (!text.trim())
                return null;
            return parseUsageSummaryState(text);
        })
        .catch(() => null);
}

async function readUsageSummaryFromStorage() {
    const engineState = await readUsageSummaryFromEngineStorage();

    return engineState || createUsageSummaryState();
}

function saveUsageSummaryToEngineStorage(state) {
    const payload = JSON.stringify(state || createUsageSummaryState());
    if (typeof cockpit?.file !== 'function')
        return Promise.resolve(false);

    return cockpit
        .spawn(['mkdir', '-p', USAGE_STORAGE_DIR], { superuser: 'try' })
        .then(() => cockpit.file(USAGE_STORAGE_PATH, { superuser: 'try' }).replace(payload))
        .then(() => true)
        .catch(() => false);
}

async function saveUsageSummaryToStorage(state) {
    await saveUsageSummaryToEngineStorage(state || createUsageSummaryState());
}

function pruneUsageSummary(state, nowTs) {
    const cutoff = dayKey(nowTs - (USAGE_MAX_DAYS * DAY_MS));
    const gpus = state.gpus || {};
    for (const id of Object.keys(gpus)) {
        const profile = gpus[id] || {};
        if (!profile.days)
            continue;

        for (const key of Object.keys(profile.days)) {
            const day = Number(key);
            if (!Number.isFinite(day) || day < cutoff)
                delete profile.days[key];
        }
    }
}

async function queryNvidia(args) {
    return cockpit.spawn(['nvidia-smi', ...args], {
        superuser: 'try',
        err: 'message',
        environ: ['LC_ALL=C'],
    });
}

function getErrorText(ex) {
    if (ex == null)
        return '';

    if (typeof ex === 'string')
        return ex.trim();

    const candidates = [
        ex.message,
        ex.problem,
        ex.reason,
        ex.code,
        ex.status,
    ];

    for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && `${candidate}`.trim())
            return `${candidate}`.trim();
    }

    if (typeof ex.toString === 'function')
        return `${ex.toString()}`.trim();

    return '';
}

function isUnsupportedFieldError(ex) {
    return /not a valid field|unsupported|not supported|not available|unrecognized|not recognized|invalid|not valid/i.test(getErrorText(ex).toLowerCase());
}

function isRecoverableProcessQueryError(ex) {
    const message = getErrorText(ex).toLowerCase();
    return /no running processes found|permission denied|not permitted|operation not permitted|insufficient privileges|driver\/library version mismatch|failed to initialize nvml|failed to initialize nvidia|nvidia-smi has failed|unable to communicate with the nvidia driver|unable to query process|failed to get process table|not found|no such file|no devices found|not supported|not a valid field|field .* not valid/.test(message);
}

function mergeGpuMaps(target, source) {
    for (const [id, payload] of source.entries()) {
        const current = target.get(id) || {};
        const mergedPayload = {};
        for (const [key, value] of Object.entries(payload)) {
            if (value === null || value === undefined)
                continue;
            mergedPayload[key] = value;
        }
        target.set(id, {
            ...current,
            ...mergedPayload,
        });
    }
    return target;
}

function getDetailsByIdOrIndex(gpu, detailMap) {
    const exact = detailMap.get(gpu.id);
    if (exact)
        return exact;

    const targetIndex = `${gpu.index || ''}`.trim();
    if (!targetIndex)
        return null;

    const byIndex = detailMap.get(targetIndex);
    if (byIndex)
        return byIndex;

    for (const candidate of detailMap.values()) {
        if (`${candidate.index || ''}`.trim() === targetIndex)
            return candidate;
    }

    return null;
}

async function queryGpuFieldMap(fields) {
    const out = await queryNvidia([
        `--query-gpu=${fields.map(f => f.field).join(',')}`,
        '--format=csv,noheader,nounits',
    ]);

    const lines = out.trim().split(/\r?\n/).map(line => line.trim()).filter(line => line.length);
    if (lines.length === 0 || isNoDeviceOutput(lines[0]))
        return new Map();

    const map = new Map();
    for (const line of lines) {
        const values = parseCsvLine(line);
        const raw = {};
        for (let i = 0; i < fields.length && i < values.length; i++)
            raw[fields[i].key] = values[i];

        const index = `${raw.index || ''}`.trim();
        const uuid = `${raw.uuid || ''}`.trim();
        const id = deriveGpuId(index, uuid);
        if (!id)
            continue;

        const parsed = {};
        for (let i = 0; i < fields.length; i++) {
            const key = fields[i].key;
            if (key === 'index' || key === 'uuid')
                parsed[key] = `${raw[key] || ''}`.trim();
            else {
                const value = toNumberWithUnit(raw[key]);
                if (Number.isFinite(value))
                    parsed[key] = value;
            }
        }

        map.set(id, {
            ...parsed,
        });
    }

    return map;
}

async function queryGpuFieldMapRecoverable(fields) {
    try {
        return await queryGpuFieldMap(fields);
    } catch (ex) {
        if (!isUnsupportedFieldError(ex))
            throw ex;

        const idFields = fields.filter(field => field.key === 'index' || field.key === 'uuid');
        const requested = fields.filter(field => field.key !== 'index' && field.key !== 'uuid');

        if (requested.length === 0)
            return new Map();

        const merged = new Map();

        for (const field of requested) {
            const fallbackFields = [
                ...idFields,
                field,
            ];

            try {
                const map = await queryGpuFieldMap(fallbackFields);
                for (const [id, payload] of map.entries()) {
                    const current = merged.get(id) || {};
                    merged.set(id, {
                        ...current,
                        ...payload,
                    });
                }
            } catch (candidateError) {
                if (!isUnsupportedFieldError(candidateError))
                    throw candidateError;
            }
        }

        return merged;
    }
}

async function queryGpuXmlDetails() {
    const out = await queryNvidia(['-q', '-x']);
    const trimmed = `${out || ''}`.trim();
    if (!trimmed || isNoDeviceOutput(trimmed))
        return new Map();

    const parsed = new DOMParser().parseFromString(trimmed, 'text/xml');
    const parserError = parsed.getElementsByTagName('parsererror');
    if (parserError && parserError.length)
        return new Map();

    const gpus = parsed.getElementsByTagName('gpu');
    if (!gpus || !gpus.length)
        return new Map();

    const map = new Map();
    for (const gpu of gpus) {
        const index = getElementText(gpu, 'minor_number') || getElementText(gpu, 'index');
        const uuid = getElementText(gpu, 'uuid');
        const id = deriveGpuId(index, uuid);
        if (!id)
            continue;

        const temperature = gpu.getElementsByTagName('temperature')[0];
        const pci = gpu.getElementsByTagName('pci')[0];
        const pciLinkInfo = pci && pci.getElementsByTagName('pci_gpu_link_info')[0];
        const clocks = gpu.getElementsByTagName('clocks')[0];
        const maxClocks = gpu.getElementsByTagName('max_clocks')[0];
        const payload = {};

        const pcieGen = toNumberWithUnit(getElementText(pciLinkInfo, [
            'pcie_link_gen_current',
            'pcie_current_link_gen',
            'pcie_gen/current_link_gen',
            'pcie_link/gen/current',
            'pcie_gen_current',
        ]));
        if (Number.isFinite(pcieGen))
            payload.pcieGen = pcieGen;

        const pcieGenCurrentDevice = toNumberWithUnit(getElementText(pciLinkInfo, [
            'pcie_gen/current_device_link_gen',
            'pcie_link/current_device_link_gen',
        ]));
        if (Number.isFinite(pcieGenCurrentDevice))
            payload.pcieGenCurrentDevice = pcieGenCurrentDevice;

        const pcieGenCurrentHost = toNumberWithUnit(getElementText(pciLinkInfo, [
            'pcie_gen/current_host_link_gen',
            'pcie_link/current_host_link_gen',
        ]));
        if (Number.isFinite(pcieGenCurrentHost))
            payload.pcieGenCurrentHost = pcieGenCurrentHost;

        if (Number.isFinite(pcieGenCurrentDevice))
            payload.pcieGen = pcieGenCurrentDevice;
        else if (Number.isFinite(pcieGenCurrentHost) && !Number.isFinite(pcieGen))
            payload.pcieGen = pcieGenCurrentHost;

        const pcieGenMax = toNumberWithUnit(getElementText(pciLinkInfo, [
            'pcie_link_gen_max',
            'pcie_max_link_gen',
            'pcie_gen/max_link_gen',
            'pcie_gen_max',
            'pcie_gen/gpu_max_link_gen',
        ]));
        if (Number.isFinite(pcieGenMax))
            payload.pcieGenMax = pcieGenMax;

        const pcieGenMaxDevice = toNumberWithUnit(getElementText(pciLinkInfo, [
            'pcie_gen/max_device_link_gen',
            'pcie_link/max_device_link_gen',
        ]));
        if (Number.isFinite(pcieGenMaxDevice))
            payload.pcieGenMaxDevice = pcieGenMaxDevice;

        const pcieGenMaxHost = toNumberWithUnit(getElementText(pciLinkInfo, [
            'pcie_gen/max_host_link_gen',
            'pcie_link/max_host_link_gen',
        ]));
        if (Number.isFinite(pcieGenMaxHost))
            payload.pcieGenMaxHost = pcieGenMaxHost;

        if (Number.isFinite(pcieGenMaxDevice))
            payload.pcieGenMax = pcieGenMaxDevice;
        else if (Number.isFinite(pcieGenMaxHost) && !Number.isFinite(pcieGenMax))
            payload.pcieGenMax = pcieGenMaxHost;

        const pcieWidth = toNumberWithUnit(getElementText(pciLinkInfo, [
            'link_width_current',
            'pcie_link_width_current',
            'link_widths/current_link_width',
            'pcie_width_current',
            'pcie_link/current_width',
        ]));
        if (Number.isFinite(pcieWidth))
            payload.pcieWidth = pcieWidth;

        const pcieWidthCurrentDevice = toNumberWithUnit(getElementText(pciLinkInfo, [
            'pcie_width/current_device_link_width',
            'pcie_link/current_device_link_width',
        ]));
        if (Number.isFinite(pcieWidthCurrentDevice))
            payload.pcieWidthCurrentDevice = pcieWidthCurrentDevice;

        const pcieWidthCurrentHost = toNumberWithUnit(getElementText(pciLinkInfo, [
            'pcie_width/current_host_link_width',
            'pcie_link/current_host_link_width',
        ]));
        if (Number.isFinite(pcieWidthCurrentHost))
            payload.pcieWidthCurrentHost = pcieWidthCurrentHost;

        if (Number.isFinite(pcieWidthCurrentDevice))
            payload.pcieWidth = pcieWidthCurrentDevice;
        else if (Number.isFinite(pcieWidthCurrentHost) && !Number.isFinite(pcieWidth))
            payload.pcieWidth = pcieWidthCurrentHost;

        const pcieWidthMax = toNumberWithUnit(getElementText(pciLinkInfo, [
            'link_width_max',
            'pcie_link_width_max',
            'link_widths/max_link_width',
            'pcie_width_max',
            'pcie_link/max_width',
        ]));
        if (Number.isFinite(pcieWidthMax))
            payload.pcieWidthMax = pcieWidthMax;

        const clockSm = toNumberWithUnit(getElementText(clocks, [
            'sm',
            'sm_clock',
            'clock_sm',
        ]));
        if (Number.isFinite(clockSm))
            payload.clockSm = clockSm;

        const clockMaxSm = toNumberWithUnit(getElementText(maxClocks, [
            'sm',
            'sm_clock',
            'clock_sm',
        ]));
        if (Number.isFinite(clockMaxSm))
            payload.clockMaxSm = clockMaxSm;

        const temperatureMaxThreshold = toNumberWithUnit(getElementText(temperature, [
            'gpu_temp_tlimit',
            'gpu_temp_max_threshold',
            'gpu_tlimit',
            'gpu_temp_threshold',
        ]));
        if (Number.isFinite(temperatureMaxThreshold))
            payload.temperatureMaxThreshold = temperatureMaxThreshold;

        const memoryTemperature = toNumberWithUnit(getElementText(temperature, [
            'memory_temp',
            'memory_temp_current',
            'memory_current_temp',
        ]));
        if (Number.isFinite(memoryTemperature))
            payload.memoryTemperature = memoryTemperature;

        const ambientTemperature = toNumberWithUnit(getElementText(temperature, [
            'ambient_temp',
            'ambient_temperature',
            'ambient',
        ]));
        if (Number.isFinite(ambientTemperature))
            payload.temperatureAmbient = ambientTemperature;

        const pcieTxThroughput = toNumberWithUnit(getElementText(pci, [
            'tx_throughput',
            'tx_util',
            'pcie_tx_throughput',
            'pcie_tx',
        ]));
        if (Number.isFinite(pcieTxThroughput))
            payload.pcieTxThroughput = pcieTxThroughput;

        const pcieRxThroughput = toNumberWithUnit(getElementText(pci, [
            'rx_throughput',
            'rx_util',
            'pcie_rx_throughput',
            'pcie_rx',
        ]));
        if (Number.isFinite(pcieRxThroughput))
            payload.pcieRxThroughput = pcieRxThroughput;

        if (Object.keys(payload).length > 0)
            map.set(id, payload);
    }

    return map;
}

async function queryGpuDetailTextMap() {
    const out = await queryNvidia(['-q']);
    const trimmed = `${out || ''}`.trim();
    if (!trimmed || isNoDeviceOutput(trimmed))
        return new Map();

    const lines = out.split(/\r?\n/);
    const map = new Map();

    let current = null;
    let payload = null;
    let detailContext = '';
    let pcieSubContext = '';
    let pcieGenMaxSource = 0;
    let pcieWidthMaxSource = 0;

    const finalizeCurrent = () => {
        if (!current || !payload)
            return;

        const id = deriveGpuId(current.index, current.uuid);
        if (id && Object.keys(payload).length > 0)
            map.set(id, payload);
    };

    for (const rawLine of lines) {
        const trimmedLine = `${rawLine || ''}`.trim();
        if (!trimmedLine)
            continue;

        if (/^GPU\s+\S+$/i.test(trimmedLine)) {
            finalizeCurrent();
            current = { index: null, uuid: null };
            payload = {};
            detailContext = '';
            pcieSubContext = '';
            pcieGenMaxSource = 0;
            pcieWidthMaxSource = 0;
            continue;
        }

        if (!current || !payload)
            continue;

        let match;

        match = trimmedLine.match(/^Minor Number\s*:\s*(\d+)/i);
        if (match) {
            current.index = match[1];
            continue;
        }

        match = trimmedLine.match(/^GPU UUID\s*:\s*([^\s]+)/i);
        if (match) {
            current.uuid = match[1];
            continue;
        }

        if (/^Temperature$/i.test(trimmedLine)) {
            detailContext = 'temperature';
            continue;
        }

        if (/^PCI(e)?$/i.test(trimmedLine)) {
            detailContext = 'pci';
            pcieSubContext = '';
            continue;
        }

        if (/^Clocks$/i.test(trimmedLine)) {
            detailContext = 'clocks';
            continue;
        }

        if (/^Max Clocks$/i.test(trimmedLine)) {
            detailContext = 'maxClocks';
            continue;
        }

        if (/^Utilization$/i.test(trimmedLine) || /^Processes$/i.test(trimmedLine)) {
            detailContext = '';
            pcieSubContext = '';
            continue;
        }

        if (detailContext === 'pci' && /^PCIe Generation$/i.test(trimmedLine)) {
            pcieSubContext = 'pcieGen';
            continue;
        }

        if (detailContext === 'pci' && /^Link Width$/i.test(trimmedLine)) {
            pcieSubContext = 'pcieWidth';
            continue;
        }

        match = trimmedLine.match(/^(Device|Host)?\s*Current\s*:\s*(.+)$/i);
        if (match && detailContext === 'pci') {
            const source = `${match[1] || ''}`.trim().toLowerCase();
            const value = toNumberWithUnit(match[2]);
            if (!Number.isFinite(value))
                continue;

            if (pcieSubContext === 'pcieGen') {
                if (!source) {
                    payload.pcieGenCurrent = value;
                } else if (source === 'device') {
                    payload.pcieGenCurrentDevice = value;
                } else if (source === 'host') {
                    payload.pcieGenCurrentHost = value;
                }
            }
            if (pcieSubContext === 'pcieWidth') {
                if (!source) {
                    payload.pcieWidthCurrent = value;
                } else if (source === 'device') {
                    payload.pcieWidthCurrentDevice = value;
                } else if (source === 'host') {
                    payload.pcieWidthCurrentHost = value;
                }
            }

            continue;
        }

        match = trimmedLine.match(/^(Device|Host)?\s*Max\s*:\s*(.+)$/i);
        if (match && detailContext === 'pci') {
            const source = `${match[1] || ''}`.trim().toLowerCase();
            const value = toNumberWithUnit(match[2]);
            if (!Number.isFinite(value))
                continue;

            const sourcePriority = source === 'device' ? 3 : source === 'host' ? 2 : 1;

            if (pcieSubContext === 'pcieGen' && sourcePriority >= pcieGenMaxSource) {
                payload.pcieGenMax = value;
                pcieGenMaxSource = sourcePriority;
            }
            if (pcieSubContext === 'pcieWidth' && sourcePriority >= pcieWidthMaxSource) {
                payload.pcieWidthMax = value;
                pcieWidthMaxSource = sourcePriority;
            }
            if (pcieSubContext === 'pcieGen' && source === 'device')
                payload.pcieGenMaxDevice = value;
            if (pcieSubContext === 'pcieGen' && source === 'host')
                payload.pcieGenMaxHost = value;
            continue;
        }

        match = trimmedLine.match(/^(\w[\w\s\.]*)\s*:\s*(.+)$/i);
        if (match) {
            const key = match[1].trim();
            const value = toNumberWithUnit(match[2]);
            if (detailContext === 'clocks') {
                if (key === 'Graphics' && Number.isFinite(value))
                    payload.clockGraphics = value;
                if (key === 'SM' && Number.isFinite(value))
                    payload.clockSm = value;
                if (key === 'Memory' && Number.isFinite(value))
                    payload.clockMemory = value;
                if (key === 'Video' && Number.isFinite(value))
                    payload.clockVideo = value;
                continue;
            }

            if (detailContext === 'maxClocks') {
                if (key === 'Graphics' && Number.isFinite(value))
                    payload.clockMaxGraphics = value;
                if (key === 'SM' && Number.isFinite(value))
                    payload.clockMaxSm = value;
                if (key === 'Memory' && Number.isFinite(value))
                    payload.clockMaxMemory = value;
                if (key === 'Video' && Number.isFinite(value))
                    payload.clockMaxVideo = value;
                continue;
            }
        }

        match = trimmedLine.match(/^GPU Current Temp\s*:\s*(.+)$/i);
        if (match) {
            const value = toNumberWithUnit(match[1]);
            if (Number.isFinite(value))
                payload.temperature = value;
            continue;
        }

        match = trimmedLine.match(/^GPU T\.?L\.?i\.?m\.?i\.?t(?:\s+Temp)?\s*:\s*(.+)$/i);
        if (match) {
            const value = toNumberWithUnit(match[1]);
            if (Number.isFinite(value))
                payload.temperatureMaxThreshold = value;
            continue;
        }

        match = trimmedLine.match(/^Memory Current Temp\s*:\s*(.+)$/i);
        if (match) {
            const value = toNumberWithUnit(match[1]);
            if (Number.isFinite(value))
                payload.memoryTemperature = value;
            continue;
        }

        match = trimmedLine.match(/^Ambient(?:\s+Temperature)?\s*:\s*(.+)$/i);
        if (match) {
            const value = toNumberWithUnit(match[1]);
            if (Number.isFinite(value))
                payload.temperatureAmbient = value;
            continue;
        }

        match = trimmedLine.match(/^Tx Throughput\s*:\s*(.+)$/i);
        if (match) {
            const value = toNumberWithUnit(match[1]);
            if (Number.isFinite(value))
                payload.pcieTxThroughput = value;
            continue;
        }

        match = trimmedLine.match(/^Rx Throughput\s*:\s*(.+)$/i);
        if (match) {
            const value = toNumberWithUnit(match[1]);
            if (Number.isFinite(value))
                payload.pcieRxThroughput = value;
            continue;
        }
    }

    finalizeCurrent();
    return map;
}

async function queryGpuDetails(existing = []) {
    const detailMaps = [];

    const tryMerge = async fields => {
        try {
            const map = await queryGpuFieldMapRecoverable(fields);
            if (map.size > 0)
                detailMaps.push(map);
        } catch (ex) {
            // keep previous fields and continue fetching other detail groups
            // some driver/runtime combinations emit non-critical errors for optional fields
            return;
        }
    };

    await tryMerge(GPU_QUERY_FIELDS_ESSENTIAL);
    await tryMerge(GPU_QUERY_FIELDS_EXT_PRIMARY);
    await tryMerge(GPU_QUERY_FIELDS_EXT_TEMP_MAX_LEGACY);
    await tryMerge(GPU_QUERY_FIELDS_EXT_TEMP_AMBIENT);

    try {
        const xmlMap = await queryGpuXmlDetails();
        if (xmlMap.size)
            detailMaps.push(xmlMap);
    } catch (ex) {
        // keep running with whatever detail source is available
    }

    try {
        const textMap = await queryGpuDetailTextMap();
        if (textMap.size)
            detailMaps.push(textMap);
    } catch (ex) {
        // keep running with whatever detail source is available
    }

    let throughputMap = new Map();
    if (pcieThroughputQueryProfile === false) {
        throughputMap = new Map();
    } else if (pcieThroughputQueryProfile) {
        try {
            throughputMap = await queryGpuFieldMap(pcieThroughputQueryProfile);
        } catch (ex) {
            // keep existing details if throughput field is not supported in this environment
            throughputMap = new Map();
            pcieThroughputQueryProfile = false;
        }
    } else {
        for (const candidate of GPU_QUERY_FIELDS_EXT_PCIE_THROUGHPUT) {
            try {
                throughputMap = await queryGpuFieldMap(candidate);
                pcieThroughputQueryProfile = candidate;
                break;
            } catch (ex) {
                continue;
            }
        }

        if (throughputMap.size === 0)
            pcieThroughputQueryProfile = false;
    }

    if (throughputMap.size)
        detailMaps.push(throughputMap);

    const resultMap = new Map();
    for (const map of detailMaps)
        mergeGpuMaps(resultMap, map);

    if (resultMap.size === 0)
        return existing;

    const fallbackByOrder = [...resultMap.values()];
    return existing.map((gpu, position) => {
        const details = getDetailsByIdOrIndex(gpu, resultMap);
        const detailEntry = details || (() => {
            const targetIndex = `${gpu.index || ''}`.trim();
            if (!targetIndex)
                return fallbackByOrder[position] || null;

            for (const item of fallbackByOrder) {
                if (`${item.index || ''}`.trim() === targetIndex)
                    return item;
            }

            return fallbackByOrder[position] || null;
        })();
        if (!detailEntry)
            return gpu;

        const pcieGenForCurrent = toNumber(
            detailEntry.pcieGenCurrent != null
                ? detailEntry.pcieGenCurrent
                : detailEntry.pcieGenCurrentDevice != null
                    ? detailEntry.pcieGenCurrentDevice
                    : detailEntry.pcieGenCurrentHost != null
                        ? detailEntry.pcieGenCurrentHost
                        : detailEntry.pcieGen != null
                            ? detailEntry.pcieGen
                            : gpu.pcieGen,
        );
        const pcieWidthForCurrent = toNumber(
            detailEntry.pcieWidthCurrent != null
                ? detailEntry.pcieWidthCurrent
                : detailEntry.pcieWidthCurrentDevice != null
                    ? detailEntry.pcieWidthCurrentDevice
                    : detailEntry.pcieWidthCurrentHost != null
                        ? detailEntry.pcieWidthCurrentHost
                        : detailEntry.pcieWidth != null
                            ? detailEntry.pcieWidth
                            : gpu.pcieWidth,
        );
        const pcieBandwidth = calculatePcieBandwidthMbps(pcieGenForCurrent, pcieWidthForCurrent);

        return {
            ...gpu,
            ...detailEntry,
            pcieGenCurrent: pcieGenForCurrent,
            pcieWidthCurrent: pcieWidthForCurrent,
            pcieBandwidth,
            pcieBandwidthMax: calculatePcieBandwidthMbps(
                toNumber(detailEntry.pcieGenMax != null ? detailEntry.pcieGenMax : gpu.pcieGenMax),
                toNumber(detailEntry.pcieWidthMax != null ? detailEntry.pcieWidthMax : gpu.pcieWidthMax),
            ) || undefined,
        };
    });
}

function updateUsageSummaryUsage(prev, gpuStats, now) {
    const state = {
        ...(prev || createUsageSummaryState()),
        updatedAt: now,
    };
    const bucket = usageBucketKey(now);
    if (!Number.isFinite(bucket))
        return state;

    if (!state.gpus || typeof state.gpus !== 'object')
        state.gpus = {};

    const profiles = state.gpus;
    for (const gpu of gpuStats) {
        const utilizationGpu = Number.isFinite(gpu.utilizationGpu) ? gpu.utilizationGpu : null;
        const utilizationMemory = Number.isFinite(gpu.utilizationMemory) ? gpu.utilizationMemory : null;
        const temperature = Number.isFinite(gpu.temperature) ? gpu.temperature : null;

        if (utilizationGpu == null && utilizationMemory == null && temperature == null)
            continue;
        if (!gpu.id)
            continue;

        const lastSampleMs = Number.isFinite(profiles[gpu.id]?.lastSampleTs) && now > profiles[gpu.id].lastSampleTs
            ? Math.min(now - profiles[gpu.id].lastSampleTs, POLL_INTERVAL_MS * 3)
            : POLL_INTERVAL_MS;
        const safeSampleMs = Number.isFinite(lastSampleMs) && lastSampleMs > 0 ? lastSampleMs : POLL_INTERVAL_MS;
        const profile = profiles[gpu.id] || {
            id: gpu.id,
            index: gpu.index,
            name: gpu.name,
            days: {},
            lastSampleTs: now,
            updatedAt: now,
        };
        profile.id = gpu.id;
        profile.index = gpu.index;
        profile.name = gpu.name;
        profile.updatedAt = now;
        profile.lastSampleTs = now;

        const dayEntry = profile.days[bucket] || createUsageBucketSummary();
        if (utilizationGpu != null) {
            dayEntry.sum += utilizationGpu;
            dayEntry.count += 1;
        }
        dayEntry.sampleMs += safeSampleMs;
        if (utilizationGpu != null && utilizationGpu > USAGE_ACTIVE_THRESHOLD) {
            dayEntry.activeSum += utilizationGpu * safeSampleMs;
            dayEntry.activeMs += safeSampleMs;
        }
        if (utilizationMemory != null) {
            dayEntry.utilizationMemorySum += utilizationMemory;
            dayEntry.utilizationMemoryCount += 1;
        }
        if (temperature != null) {
            dayEntry.temperatureSum += temperature;
            dayEntry.temperatureCount += 1;
        }
        dayEntry.spanMs = Number.isFinite(dayEntry.spanMs) ? dayEntry.spanMs : USAGE_BUCKET_MS;
        profile.days[bucket] = dayEntry;

        profiles[gpu.id] = profile;
    }

    state.gpus = profiles;
    pruneUsageSummary(state, now);

    return state;
}

function createUsageBucketSummary() {
    return {
        sum: 0,
        count: 0,
        activeSum: 0,
        sampleMs: 0,
        activeMs: 0,
        spanMs: USAGE_BUCKET_MS,
        utilizationMemorySum: 0,
        utilizationMemoryCount: 0,
        temperatureSum: 0,
        temperatureCount: 0,
    };
}

function normalizeUsageBucket(entry) {
    if (!entry || typeof entry !== 'object')
        return createUsageBucketSummary();

    const sum = Number.isFinite(entry.sum) ? entry.sum : 0;
    const count = Number.isFinite(entry.count) ? entry.count : 0;
    const sampleMs = Number.isFinite(entry.sampleMs) ? entry.sampleMs : count * POLL_INTERVAL_MS;
    const dayBucketLike = (Number.isFinite(entry.sampleMs) && entry.sampleMs >= DAY_MS * 0.75)
        || (Number.isFinite(entry.count) && entry.count >= (DAY_MS / POLL_INTERVAL_MS * 0.75));
    const spanMs = Number.isFinite(entry.spanMs) && entry.spanMs > 0
        ? entry.spanMs
        : (dayBucketLike ? DAY_MS : USAGE_BUCKET_MS);

    const hasActive = Number.isFinite(entry.activeSum) || Number.isFinite(entry.activeMs);
    const hasUtilization = sum > 0 || count > 0;

    const activeSum = hasActive
        ? (Number.isFinite(entry.activeSum) ? entry.activeSum : 0)
        : 0;
    const activeMs = hasActive
        ? (Number.isFinite(entry.activeMs) ? entry.activeMs : (hasUtilization ? sampleMs : 0))
        : (hasUtilization ? sampleMs : 0);

    return {
        sum,
        count,
        activeSum,
        sampleMs,
        activeMs,
        spanMs,
        utilizationMemorySum: Number.isFinite(entry.utilizationMemorySum) ? entry.utilizationMemorySum : 0,
        utilizationMemoryCount: Number.isFinite(entry.utilizationMemoryCount) ? entry.utilizationMemoryCount : 0,
        temperatureSum: Number.isFinite(entry.temperatureSum) ? entry.temperatureSum : 0,
        temperatureCount: Number.isFinite(entry.temperatureCount) ? entry.temperatureCount : 0,
    };
}

function sumUsageBuckets(bucketMap, from, to) {
    const total = {
        sum: 0,
        count: 0,
        activeSum: 0,
        sampleMs: 0,
        activeMs: 0,
        utilizationMemorySum: 0,
        utilizationMemoryCount: 0,
        temperatureSum: 0,
        temperatureCount: 0,
    };

    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to)
        return total;

    if (!bucketMap || typeof bucketMap !== 'object')
        return total;

    for (const key of Object.keys(bucketMap)) {
        const dayTs = Number(key);
        if (!Number.isFinite(dayTs))
            continue;

        const bucket = normalizeUsageBucket(bucketMap[dayTs]);
        const bucketEnd = dayTs + bucket.spanMs;
        const overlapStart = Math.max(dayTs, from);
        const overlapEnd = Math.min(bucketEnd, to);
        if (overlapEnd <= overlapStart)
            continue;

        const overlap = (overlapEnd - overlapStart) / bucket.spanMs;
        total.sum += bucket.sum * overlap;
        total.count += bucket.count * overlap;
        total.activeSum += bucket.activeSum * overlap;
        total.sampleMs += bucket.sampleMs * overlap;
        total.activeMs += bucket.activeMs * overlap;
        total.utilizationMemorySum += bucket.utilizationMemorySum * overlap;
        total.utilizationMemoryCount += bucket.utilizationMemoryCount * overlap;
        total.temperatureSum += bucket.temperatureSum * overlap;
        total.temperatureCount += bucket.temperatureCount * overlap;
    }

    return total;
}

function addUsageTotals(target, source) {
    target.sum += source.sum;
    target.count += source.count;
    target.activeSum += source.activeSum;
    target.sampleMs += source.sampleMs;
    target.activeMs += source.activeMs;
    target.utilizationMemorySum += source.utilizationMemorySum;
    target.utilizationMemoryCount += source.utilizationMemoryCount;
    target.temperatureSum += source.temperatureSum;
    target.temperatureCount += source.temperatureCount;
}

function buildUsageSummaryStats(accumulator) {
    return {
        avg: accumulator.count > 0 ? accumulator.sum / accumulator.count : null,
        inUsePercent: accumulator.activeMs > 0 ? accumulator.activeSum / accumulator.activeMs : null,
        inUseMs: accumulator.activeMs > 0 ? accumulator.activeMs : null,
        memoryAvg: accumulator.utilizationMemoryCount > 0 ? accumulator.utilizationMemorySum / accumulator.utilizationMemoryCount : null,
        temperatureAvg: accumulator.temperatureCount > 0 ? accumulator.temperatureSum / accumulator.temperatureCount : null,
    };
}

function newUsagePeriod() {
    return {
        sum: 0,
        count: 0,
        activeSum: 0,
        sampleMs: 0,
        activeMs: 0,
        utilizationMemorySum: 0,
        utilizationMemoryCount: 0,
        temperatureSum: 0,
        temperatureCount: 0,
    };
}

function computeUsageSummary(profiles, nowTs, gpuIds) {
    const ids = gpuIds.filter(Boolean);
    const now = nowTs;
    const startDay = now - USAGE_WINDOW_DAY;
    const startWeek = now - USAGE_WINDOW_WEEK;
    const startMonth = now - USAGE_WINDOW_MONTH;

    const overall = {
        day: null,
        week: null,
        month: null,
        dayMemory: null,
        weekMemory: null,
        monthMemory: null,
        dayTemperature: null,
        weekTemperature: null,
        monthTemperature: null,
        dayInUseMs: null,
        weekInUseMs: null,
        monthInUseMs: null,
        dayInUsePercent: null,
        weekInUsePercent: null,
        monthInUsePercent: null,
    };
    const gpuRows = [];
    const dayKeys = [];
    const monthKeys = [];
    const today = dayKey(now);

    for (let i = 0; i < 7; i += 1) {
        dayKeys.push(today - ((6 - i) * DAY_MS));
    }
    for (let i = 0; i < 30; i += 1) {
        monthKeys.push(today - ((29 - i) * DAY_MS));
    }

    const overallDay = newUsagePeriod();
    const overallWeek = newUsagePeriod();
    const overallMonth = newUsagePeriod();

    const daySeries = dayKeys.map(key => {
        let sum = 0;
        let count = 0;
        for (const gpuId of ids) {
            const profile = profiles[gpuId];
            if (!profile || !profile.days)
                continue;

            const entry = sumUsageBuckets(profile.days, key, key + DAY_MS);
            sum += entry.sum;
            count += entry.count;
        }

        return {
            t: key,
            value: count ? sum / count : null,
            label: formatDayLabel(key),
        };
    });

    const monthSeries = monthKeys.map(key => {
        let sum = 0;
        let count = 0;

        for (const gpuId of ids) {
            const profile = profiles[gpuId];
            if (!profile || !profile.days)
                continue;

            const entry = sumUsageBuckets(profile.days, key, key + DAY_MS);
            sum += entry.sum;
            count += entry.count;
        }

        return {
            t: key,
            value: count ? sum / count : null,
            label: formatDayLabel(key),
        };
    });

    for (const id of ids) {
        const profile = profiles[id];
        if (!profile)
            continue;

        const dayBuckets = sumUsageBuckets(profile.days, startDay, now);
        const weekBuckets = sumUsageBuckets(profile.days, startWeek, now);
        const monthBuckets = sumUsageBuckets(profile.days, startMonth, now);

        addUsageTotals(overallDay, dayBuckets);
        addUsageTotals(overallWeek, weekBuckets);
        addUsageTotals(overallMonth, monthBuckets);

        const daySummary = buildUsageSummaryStats(dayBuckets);
        const weekSummary = buildUsageSummaryStats(weekBuckets);
        const monthSummary = buildUsageSummaryStats(monthBuckets);
        gpuRows.push({
            id,
            name: profile.name || id,
            index: profile.index,
            day: daySummary.avg,
            week: weekSummary.avg,
            month: monthSummary.avg,
            dayMemory: daySummary.memoryAvg,
            weekMemory: weekSummary.memoryAvg,
            monthMemory: monthSummary.memoryAvg,
            dayTemperature: daySummary.temperatureAvg,
            weekTemperature: weekSummary.temperatureAvg,
            monthTemperature: monthSummary.temperatureAvg,
            dayInUseMs: daySummary.inUseMs,
            weekInUseMs: weekSummary.inUseMs,
            monthInUseMs: monthSummary.inUseMs,
            dayInUsePercent: daySummary.inUsePercent,
            weekInUsePercent: weekSummary.inUsePercent,
            monthInUsePercent: monthSummary.inUsePercent,
        });
    }

    const overallDaySummary = buildUsageSummaryStats(overallDay);
    const overallWeekSummary = buildUsageSummaryStats(overallWeek);
    const overallMonthSummary = buildUsageSummaryStats(overallMonth);

    overall.day = overallDaySummary.avg;
    overall.week = overallWeekSummary.avg;
    overall.month = overallMonthSummary.avg;
    overall.dayMemory = overallDaySummary.memoryAvg;
    overall.weekMemory = overallWeekSummary.memoryAvg;
    overall.monthMemory = overallMonthSummary.memoryAvg;
    overall.dayTemperature = overallDaySummary.temperatureAvg;
    overall.weekTemperature = overallWeekSummary.temperatureAvg;
    overall.monthTemperature = overallMonthSummary.temperatureAvg;
    overall.dayInUseMs = overallDaySummary.inUseMs;
    overall.weekInUseMs = overallWeekSummary.inUseMs;
    overall.monthInUseMs = overallMonthSummary.inUseMs;
    overall.dayInUsePercent = overallDaySummary.inUsePercent;
    overall.weekInUsePercent = overallWeekSummary.inUsePercent;
    overall.monthInUsePercent = overallMonthSummary.inUsePercent;

    return { overall, gpuRows, daySeries, monthSeries };
}

async function queryGpuBase() {
    const out = await queryNvidia([
        `--query-gpu=${GPU_QUERY_FIELDS.map(f => f.field).join(',')}`,
        '--format=csv,noheader,nounits',
    ]);

    const lines = out.trim().split(/\r?\n/).map(line => line.trim()).filter(line => line.length);
    if (lines.length === 0 || isNoDeviceOutput(lines[0]))
        return [];

    return lines.map(line => {
        const values = parseCsvLine(line);
        const raw = {};
        for (let i = 0; i < GPU_QUERY_FIELDS.length && i < values.length; i++)
            raw[GPU_QUERY_FIELDS[i].key] = values[i];

        const index = `${raw.index || ''}`.trim();
        const uuid = `${raw.uuid || ''}`.trim();
        const id = deriveGpuId(index, uuid);

        const memTotal = toNumber(raw.memoryTotal);
        const memUsed = toNumber(raw.memoryUsed);
        const memFree = toNumber(raw.memoryFree);
        const utilizationMemory = Number.isFinite(toNumber(raw.utilizationMemory))
            ? toNumber(raw.utilizationMemory)
            : Number.isFinite(memTotal) && memTotal > 0 && Number.isFinite(memUsed)
                ? (memUsed / memTotal) * 100
                : null;

        return {
            id,
            index,
            uuid,
        name: `${raw.name || _('GPU')}`.trim(),
            pcibusid: `${raw.pcibusid || ''}`.trim(),
            utilizationGpu: toNumber(raw.utilizationGpu),
            utilizationMemory,
            memoryTotal: memTotal !== null ? memTotal * 1024 * 1024 : null,
            memoryUsed: memUsed !== null ? memUsed * 1024 * 1024 : null,
            memoryFree: memFree !== null ? memFree * 1024 * 1024 : null,
            temperature: toNumber(raw.temperature),
            fanSpeed: toNumber(raw.fanSpeed),
            powerDraw: toNumber(raw.powerDraw),
            powerLimit: toNumber(raw.powerLimit),
        };
    }).filter(entry => entry.id !== '');
}

async function queryProcesses() {
    const queryVariants = PROCESS_QUERY_FIELDS.map(fields => fields.map(field => field.field).join(','));
    const collected = [];
    const attempts = [];
    const fatalErrors = [];

    const collectRows = rows => {
        if (!rows || !rows.length)
            return;
        collected.push(...rows);
    };

    const collect = async (label, fn) => {
        try {
            const rows = await fn();
            attempts.push({ label, success: true, rows: rows || [] });
            collectRows(rows);
            return rows;
        } catch (ex) {
            const message = getErrorText(ex);
            attempts.push({ label, success: false, message });
            if (!isUnsupportedFieldError(ex) && !isRecoverableProcessQueryError(ex))
                fatalErrors.push(ex);
            return [];
        }
    };

    collectRows(await collect('xml', () => queryProcessesFromXml()));
    collectRows(await collect('pmon', () => queryProcessesFromPmon()));
    collectRows(await collect('nvidia-q-process', async () => {
        const out = await queryNvidia(['-q', '-d', 'PROCESS']);
        return parseProcessesFromNvidiaQText(out);
    }));
    collectRows(await collect('nvidia-q-pids', async () => {
        const out = await queryNvidia(['-q', '-d', 'PIDS']);
        return parseProcessesFromNvidiaQText(out);
    }));
    collectRows(await collect('nvidia-q-full', async () => {
        const out = await queryNvidia(['-q']);
        return parseProcessesFromNvidiaQText(out);
    }));
    collectRows(await collect('top-table', () => queryProcessesFromTopTable()));

    for (const query of queryVariants) {
        const fields = PROCESS_QUERY_FIELDS.find(candidate => candidate.map(item => item.field).join(',') === query);
        const selectedFields = fields || [];
        collectRows(await collect(`compute-${query}`, () => queryNvidia([
            `--query-compute-apps=${query}`,
            '--format=csv,noheader,nounits',
        ]).then(out => parseComputeAppsResult(out, selectedFields))));
    }

    collectRows(await collect('top-table-2', () => queryProcessesFromTopTable()));

    const hasAnyRows = collected.length > 0;
    const hasAnyAttempt = attempts.length > 0;
    const hasNoRows = hasAnyAttempt && !hasAnyRows;

    if (hasNoRows && attempts.every(item => !item.success)) {
        const messages = attempts
            .map(item => item.message)
            .filter((message, index, list) => message && list.indexOf(message) === index);

        const detail = messages.length
            ? ` Last errors: ${messages.join('; ')}`
            : ' No supported process query method returned any rows.';
        if (fatalErrors.length > 0)
            throw new Error(`Failed to get process table.${detail}`);
        throw new Error(`Process table update warning.${detail}`);
    }

    return dedupeProcesses(collected);
}

async function queryProcessesFromXml() {
    let out = '';
    try {
        out = await queryNvidia(['-q', '-x', '-d', 'PIDS']);
    } catch (_ignore) {
        out = await queryNvidia(['-q', '-x']);
    }
    const trimmed = `${out || ''}`.trim();
    if (!trimmed || isNoDeviceOutput(trimmed))
        return [];

    const parsed = new DOMParser().parseFromString(trimmed, 'text/xml');
    const parserError = parsed.getElementsByTagName('parsererror');
    if (parserError && parserError.length) {
        const manual = dedupeProcesses(parseProcessesFromNvidiaXml(trimmed));
        if (manual.length)
            return manual;
        return [];
    }

    const gpuNodes = parsed.getElementsByTagName('gpu');
    if (!gpuNodes || !gpuNodes.length)
        return dedupeProcesses(parseProcessesFromNvidiaXml(trimmed));

    const list = [];
    for (const gpu of gpuNodes) {
        const gpuName = (
            getElementText(gpu, ['product_name', 'product']) ||
            getElementText(gpu, 'name') ||
            getElementText(gpu, 'minor_number') ||
            ''
        ).trim();
        const processNodes = [
            ...findAllTagsByName(gpu, 'process_info'),
            ...findAllTagsByName(gpu, 'process'),
        ];

        for (const proc of processNodes) {
            const pid = parseInt(`${(
                getElementText(proc, 'pid') ||
                getElementText(proc, 'process_id') ||
                getElementText(proc, 'processid')
            ) || ''}`, 10);
            if (!Number.isFinite(pid) || pid <= 0)
                continue;

            const usedMemoryMiB = toNumberWithUnit(getElementText(proc, [
                'used_gpu_memory',
                'used_memory',
                'used_memory_mib',
                'memory_used',
            ]));
            list.push({
                pid,
                type: `${getElementText(proc, 'type') || 'C'}`,
                gpuName,
                processName: getElementText(proc, ['process_name', 'process_name_raw', 'name']) || _('Unknown process'),
                usedMemoryMiB,
            });
        }
    }

    if (list.length)
        return dedupeProcesses(list);

    return dedupeProcesses(parseProcessesFromNvidiaXml(trimmed));
}

function parseProcessesFromNvidiaXml(xmlText) {
    const blocks = `${xmlText || ''}`.match(/<\s*gpu\b[\s\S]*?<\s*\/\s*gpu\s*>/gi);
    if (!blocks || !blocks.length)
        return [];

    const list = [];
    for (const gpuBlock of blocks) {
        const gpuIndex = getTagValue(gpuBlock, 'minor_number') || getTagValue(gpuBlock, 'index');
        list.push(...parseProcessesFromGpuXmlBlock(gpuBlock, gpuIndex));
    }

    return list;
}

function parseProcessesFromNvidiaQText(nvidiaText) {
    const lines = `${nvidiaText || ''}`.split(/\r?\n/);
    const processes = [];
    let currentGpuName = '';
    let currentGpuBus = '';
    let currentProc = null;
    let inProcessSection = false;

    const finalizeSection = () => {
        currentProc = null;
    };

    const isNewTopSectionLine = line => {
        if (!line)
            return false;

        // Skip process child fields while we are parsing process blocks.
        if (/^(?:Process )?ID\s*:/i.test(line)
            || /^Type\s*:/i.test(line)
            || /^(?:Process )?Name\s*:/i.test(line)
            || /^Used (?:GPU )?Memory\s*:/i.test(line))
            return false;

        // A new top-level section starts when we see a section title with colon.
        return /^[A-Za-z].*:\s*$/.test(line) && !/^Processes\s*:/i.test(line);
    };

    for (const rawLine of lines) {
        const line = `${rawLine || ''}`.trim();
        if (!line)
            continue;

        const gpuMatch = line.match(/^GPU\s+([0-9A-Fa-f:.]+)$/i);
        if (gpuMatch) {
            currentGpuBus = `${gpuMatch[1] || ''}`.trim();
            currentGpuName = `GPU ${currentGpuBus}`;
            currentProc = null;
            continue;
        }

        const productMatch = line.match(/^Product Name\s*:\s*(.+)$/i);
        if (productMatch) {
            currentGpuName = `${productMatch[1] || ''}`.trim();
            if (currentGpuBus && !currentGpuName.startsWith(currentGpuBus))
                currentGpuName = `${currentGpuName} (${currentGpuBus})`;
            currentProc = null;
            continue;
        }

        const procMatch = line.match(/^Process ID\s*:\s*(\d+)$/i);
        if (procMatch) {
            const pid = parseInt(`${procMatch[1] || ''}`, 10);
            if (Number.isFinite(pid) && pid > 0) {
                currentProc = {
                    pid,
                    type: '',
                    gpuName: currentGpuName,
                    processName: _('Unknown process'),
                    usedMemoryMiB: null,
                    gpuBus: currentGpuBus,
                };
                processes.push(currentProc);
            } else {
                currentProc = null;
            }
            inProcessSection = true;
            continue;
        }

        if (inProcessSection && isNewTopSectionLine(line)) {
            finalizeSection();
            inProcessSection = false;
            continue;
        }

        if (/^Processes\s*:/i.test(line)) {
            inProcessSection = true;
            finalizeSection();
            continue;
        }

        if (!currentProc)
            continue;

        const typeMatch = line.match(/^Type\s*:\s*([A-Za-z+\- ]+)$/i);
        if (typeMatch) {
            currentProc.type = `${typeMatch[1] || ''}`.trim();
            continue;
        }

        const nameMatch = line.match(/^(?:Process )?Name\s*:\s*(.+)$/i)
            || line.match(/^Command\s*:\s*(.+)$/i);
        if (nameMatch) {
            currentProc.processName = `${nameMatch[1] || ''}`.trim() || _('Unknown process');
            continue;
        }

        const memMatch = line.match(/^Used (?:GPU )?Memory(?:\s*\([^)]+\))?\s*:\s*(.+)$/i)
            || line.match(/^Used Memory\s*:\s*(.+)$/i)
            || line.match(/^FB Memory\s*:\s*(.+)$/i);
        if (memMatch) {
            const usedMemoryMiB = toMemoryMiB(memMatch[1]);
            if (Number.isFinite(usedMemoryMiB))
                currentProc.usedMemoryMiB = usedMemoryMiB;
        }
    }

    return dedupeProcesses(processes.filter(proc => proc && Number.isFinite(proc.pid) && proc.pid > 0));
}

async function queryProcessesFromTopTable() {
    const out = await queryNvidia([]);
    if (!out)
        return [];

    const lines = `${out}`.split(/\r?\n/);
    const items = [];
    let inProcessSection = false;
    let sawHeader = false;

    const parseMemoryText = value => {
        const text = `${value || ''}`.trim();
        if (!text)
            return null;

        const withUnit = text.match(/(\d+(?:\.\d+)?\s*(?:KiB|MiB|GiB|KB|MB|GB|TB|B)\b)/i);
        if (withUnit)
            return toMemoryMiB(withUnit[1]);

        const numberOnly = text.match(/^(\d+(?:\.\d+)?)$/);
        if (numberOnly)
            return toMemoryMiB(`${numberOnly[1]} MiB`);

        return null;
    };

    const parseFromPipeColumns = line => {
        const cols = line.split('|').map(value => value.trim()).filter(value => value);
        if (cols.length < 3)
            return null;

        const gpuName = `${cols[0] || ''}`.trim();
        if (!/^\d+$/.test(gpuName) && !/^GPU\s*$/i.test(gpuName))
            return null;

        const pidIndex = 1;
        if (pidIndex >= cols.length || !/^\d+$/.test(`${cols[pidIndex]}`))
            return null;

        const pid = parseInt(`${cols[pidIndex]}`, 10);
        if (!Number.isFinite(pid) || pid <= 0)
            return null;

        let typeIndex = 2;
        if (typeIndex >= cols.length)
            return null;
        const type = canonicalizeProcessType(cols[typeIndex]);
        if (!type)
            return null;

        let usedMemoryMiB = null;
        let processNameTokens = cols.slice(3);
        for (let i = 3; i < cols.length; i += 1) {
            const memoryCandidate = parseMemoryText(cols[i]);
            if (Number.isFinite(memoryCandidate)) {
                usedMemoryMiB = memoryCandidate;
                processNameTokens = cols.slice(3, i);
                break;
            }
        }

        const processName = processNameTokens.join(' ').trim() || _('Unknown process');
        return {
            pid,
            type,
            gpuName,
            processName,
            usedMemoryMiB,
        };
    };

    const parseFromWhitespace = line => {
        const tokens = line.split(/\s+/).map(value => value.trim()).filter(value => value);
        if (tokens.length < 4 || !/^\d+$/.test(`${tokens[0]}`))
            return null;

        const gpuName = `${tokens[0] || ''}`.trim();
        const pid = parseInt(`${tokens[1]}`, 10);
        if (!Number.isFinite(pid) || pid <= 0)
            return null;

        const possibleTypeTokens = ['G', 'C', 'C+G', 'G+C'];
        let typeIndex = -1;
        let type = '';
        for (let i = 2; i < tokens.length; i += 1) {
            const token = `${tokens[i] || ''}`;
            if (!token || /MiB|KiB|GiB|KB|MB|GB|TB|B/i.test(token))
                break;

            const normalized = canonicalizeProcessType(token);
            if (possibleTypeTokens.includes(normalized) || /^[A-Za-z+]+$/.test(token) && token.length <= 8) {
                typeIndex = i;
                type = canonicalizeProcessType(token);
                break;
            }
        }

        if (typeIndex < 0)
            return null;

        let memoryIndex = -1;
        for (let i = tokens.length - 1; i >= typeIndex + 1; i -= 1) {
            const token = `${tokens[i] || ''}`;
            if (/(\d+(?:\.\d+)?\s*(?:KiB|MiB|GiB|KB|MB|GB|TB|B)\b)/i.test(token)) {
                memoryIndex = i;
                break;
            }
            if (/^(?:KiB|MiB|GiB|KB|MB|GB|TB|B)$/i.test(token)
                && i > 0
                && /^\d+(?:\.\d+)?$/.test(`${tokens[i - 1] || ''}`)) {
                memoryIndex = i - 1;
                break;
            }
        }

        const processNameTokens = memoryIndex > typeIndex
            ? tokens.slice(typeIndex + 1, memoryIndex)
            : tokens.slice(typeIndex + 1);
        const processName = processNameTokens.join(' ').trim() || _('Unknown process');
        const usedMemoryText = memoryIndex >= 0 ? `${tokens[memoryIndex] || ''}` : '';
        const usedMemoryMiB = parseMemoryText(usedMemoryText);

        return {
            pid,
            type,
            gpuName,
            processName,
            usedMemoryMiB,
        };
    };

    const parseLine = line => {
        if (line.includes('|'))
            return parseFromPipeColumns(line);

        return parseFromWhitespace(line);
    };

    for (const rawLine of lines) {
        const trimmed = `${rawLine || ''}`.trim();
        if (!trimmed)
            continue;

        if (!inProcessSection) {
            if (/^Processes\s*:/i.test(trimmed)) {
                inProcessSection = true;
            }
            continue;
        }

        if (/^No running processes found/i.test(trimmed))
            return [];

        if (/^\+[-=]+\+?$/.test(trimmed) || /^-+$/.test(trimmed))
            continue;

        if (/^GPU Instance ID/i.test(trimmed) || /^Compute Instance ID/i.test(trimmed))
            continue;

        if (/^Process ID\s*:|^Process Name\s*:|^Type\s*:|^Used GPU Memory/i.test(trimmed))
            continue;

        if (!sawHeader && /GPU\s+PID\s+Type/i.test(trimmed.replace(/\|/g, ' '))) {
            sawHeader = true;
            continue;
        }

        const parsed = parseLine(trimmed);
        if (!parsed)
            continue;

        items.push(parsed);
    }

    return dedupeProcesses(items);
}

async function queryProcessesFromPmon() {
    const commandVariants = [
        ['pmon', '-c', '1'],
        ['pmon', '-c', '1', '-s', 'u'],
        ['pmon', '-c', '1', '-s', 'um'],
        ['pmon', '-c', '1', '-s', 'uma'],
    ];

    for (const args of commandVariants) {
        try {
            const out = await queryNvidia(args);
            const parsed = parseProcessesFromNvidiaPmonText(out);
            if (parsed.length > 0)
                return parsed;
        } catch (ex) {
            const message = `${getErrorText(ex) || ''}`;
            if (message && /not supported|unsupported|invalid argument|unrecognized|unknown option|failed to initialize/i.test(message))
                continue;
            continue;
        }
    }

    return [];
}

function parseProcessesFromNvidiaPmonText(text) {
    const lines = `${text || ''}`.split(/\r?\n/);
    const items = [];

    for (const rawLine of lines) {
        const trimmed = `${rawLine || ''}`.trim();
        if (!trimmed)
            continue;

        if (/^#/.test(trimmed) || /^\-+$/.test(trimmed) || /^\+[-=]+\+?$/.test(trimmed))
            continue;

        if (/^No running processes found/i.test(trimmed))
            return [];

        const normalized = trimmed.toLowerCase();
        if (/^gpu\s+pid/.test(normalized) || /process/i.test(normalized) && /command/i.test(normalized))
            continue;

        const body = trimmed.replace(/^\|/, '').replace(/\|$/, '').trim();
        const tokens = body.split(/\s+/).map(value => value.trim()).filter(value => value);
        if (tokens.length < 3)
            continue;

        let gpuIndex = -1;
        let pidIndex = -1;
        for (let i = 0; i < tokens.length - 1; i += 1) {
            if (/^\d+$/.test(tokens[i]) && /^\d+$/.test(tokens[i + 1])) {
                gpuIndex = i;
                pidIndex = i + 1;
                break;
            }
        }
        if (pidIndex < 0)
            continue;

        const pid = parseInt(`${tokens[pidIndex] || ''}`, 10);
        if (!Number.isFinite(pid) || pid <= 0)
            continue;

        let typeIndex = -1;
        for (let i = pidIndex + 1; i < tokens.length; i += 1) {
            if (/^[A-Za-z+]+$/.test(`${tokens[i] || ''}`) && !/^(MIG|MIGGPU|UNKNOWN|PROCESS|COMMAND|TYPE)$/i.test(tokens[i])) {
                typeIndex = i;
                break;
            }
        }
        if (typeIndex < 0)
            continue;

        const type = canonicalizeProcessType(tokens[typeIndex] || 'C');

        let usedMemoryMiB = null;
        let endIdx = tokens.length;
        for (let i = typeIndex + 1; i < tokens.length; i += 1) {
            const value = `${tokens[i] || ''}`;
            if (/\d+(?:\.\d+)?(?:MiB|KiB|GiB)/i.test(value)) {
                usedMemoryMiB = toMemoryMiB(value);
                endIdx = i;
                break;
            }

            if (/^(?:MiB|KiB|GiB)$/i.test(value) && i > 0 && /^\d+(?:\.\d+)?$/.test(`${tokens[i - 1] || ''}`)) {
                usedMemoryMiB = toMemoryMiB(`${tokens[i - 1]} ${tokens[i]}`);
                endIdx = i - 1;
                break;
            }
        }

        const processName = (tokens.slice(typeIndex + 1, endIdx)
            .filter(value => value && !/^MiB$/i.test(value) && !/\d+MiB/i.test(value))
            .join(' ') || _('Unknown process')).trim();

        items.push({
            pid,
            type,
            gpuName: `${tokens[gpuIndex] || ''}`,
            processName,
            usedMemoryMiB: Number.isFinite(usedMemoryMiB) ? usedMemoryMiB : null,
        });
    }

    return dedupeProcesses(items);
}

function formatBytes(bytes) {
    if (bytes === null || !Number.isFinite(bytes))
        return _('N/A');
    return cockpit.format_bytes(bytes, { base2: true, precision: 2 });
}

function safeFormatNumber(value, precision = 1) {
    if (value === null || !Number.isFinite(value))
        return _('N/A');

    const normalized = Number.isFinite(precision) ? Math.max(0, Math.min(20, Math.floor(Number(precision)))) : 1;

    try {
        return cockpit.format_number(value, normalized);
    } catch (error) {
        try {
            return Number(value).toLocaleString(undefined, {
                minimumFractionDigits: normalized,
                maximumFractionDigits: normalized,
            });
        } catch (_ignore) {
            return `${Number(value).toFixed(normalized)}`;
        }
    }
}

function formatPercent(value) {
    return `${safeFormatNumber(value)}%`;
}

function formatUsageHours(value) {
    if (!Number.isFinite(value))
        return _('N/A');

    const hours = value / (60 * 60 * 1000);
    const roundedHours = Math.round(hours * 10) / 10;

    if (!Number.isFinite(roundedHours) || roundedHours < 0)
        return _('N/A');

    const precision = roundedHours < 1 ? 1 : (Number.isInteger(roundedHours) ? 0 : 1);
    return `${safeFormatNumber(roundedHours, precision)}h`;
}

function formatWatt(value) {
    return `${safeFormatNumber(value)} W`;
}

function formatTemp(value) {
    return Number.isFinite(value) ? `${safeFormatNumber(value)} °C` : _('N/A');
}

function formatTempStatsLabel(current, stats) {
    if (!stats && !Number.isFinite(current))
        return _('N/A');

    if (!stats)
        return formatTemp(current);

    return `${formatTemp(current)} (${_('min')} ${formatTemp(stats.min)} / ${_('max')} ${formatTemp(stats.max)} / ${_('avg')} ${formatTemp(stats.avg)})`;
}

function formatPcieThroughput(value) {
    if (value === null || !Number.isFinite(value))
        return _('N/A');

    return `${cockpit.format_bytes(value * 1024, { base2: true, precision: 1 })}/s`;
}

function createHistoryEntry(gpu, time) {
    return {
        t: time,
        utilizationGpu: gpu.utilizationGpu,
        utilizationMemory: gpu.utilizationMemory,
        memoryUsed: gpu.memoryUsed,
        memoryTotal: gpu.memoryTotal,
        powerDraw: gpu.powerDraw,
        powerLimit: gpu.powerLimit,
        temperature: gpu.temperature,
        temperatureMaxThreshold: gpu.temperatureMaxThreshold,
        memoryTemperature: gpu.memoryTemperature,
        temperatureAmbient: gpu.temperatureAmbient,
        fanSpeed: gpu.fanSpeed,
        clockSm: gpu.clockSm,
        pcieWidth: gpu.pcieWidth,
        pcieGen: gpu.pcieGen,
        pcieBandwidth: gpu.pcieBandwidth,
        pcieBandwidthMax: gpu.pcieBandwidthMax,
        pcieTxThroughput: gpu.pcieTxThroughput,
        pcieRxThroughput: gpu.pcieRxThroughput,
    };
}

function clamp01(v, fallback = 0) {
    if (!Number.isFinite(v))
        return fallback;

    return Math.min(100, Math.max(fallback, v));
}

function MetricSection({ title, children, className }) {
    return (
        <section className={`nvidia-gpu-metric-section${className ? ` ${className}` : ''}`}>
            <div className="nvidia-gpu-metric-section__title">{title}</div>
            <div className="nvidia-gpu-metric-section__content">
                {children}
            </div>
        </section>
    );
}

function ChartSection({ title, children, className }) {
    return (
        <section className={`nvidia-gpu-chart-section${className ? ` ${className}` : ''}`}>
            <div className="nvidia-gpu-chart-section__title">{title}</div>
            {children}
        </section>
    );
}

function buildSmoothPath(points) {
    if (points.length < 2)
        return '';

    const commands = [];
    commands.push(`M ${points[0].x} ${points[0].y}`);

    for (let i = 0; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        const prev = i > 0 ? points[i - 1] : curr;
        const next2 = i < points.length - 2 ? points[i + 2] : next;

        const cp1X = curr.x + (next.x - prev.x) / 4;
        const cp1Y = curr.y;
        const cp2X = next.x - (next2.x - curr.x) / 4;
        const cp2Y = next.y;

        commands.push(`C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${next.x} ${next.y}`);
    }

    return commands.join(' ');
}

function makeSafeChartId(value) {
    return String(value || 'metric')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function HistoryChart({ title, unit, color, data, max, min = 0, chartId = '', className = '', currentValue = null }) {
    const points = data.filter(p => Number.isFinite(p.value));
    const effectivePoints = points.length
        ? points
        : (Number.isFinite(currentValue) ? [{ value: currentValue }] : []);
    const noData = effectivePoints.length === 0;
    const width = 100;

    const all = effectivePoints.map(p => p.value).filter(v => Number.isFinite(v));
    const maxProvided = Number.isFinite(max);
    const maxValue = maxProvided ? max : (all.length ? Math.max(...all, min + 1) : min + 1);
    const minValue = all.length ? Math.min(...all, min) : min;
    const padded = Math.max(maxValue - minValue, 1);

    const curvePoints = [];
    const lineFill = [];
    const sparkline = [];
    const gridLines = [25, 50, 75];
    const renderPoints = effectivePoints.length === 1 ? [effectivePoints[0], effectivePoints[0]] : effectivePoints;

    const chartIdText = makeSafeChartId(`${chartId}-${title}`);

    if (!noData) {
        renderPoints.forEach((entry, index) => {
            if (!Number.isFinite(entry.value))
                return;

            const x = (index / (renderPoints.length - 1 || 1)) * width;
            const v = (entry.value - minValue) / padded;
            const y = 100 - v * 100;

            curvePoints.push({
                x,
                y,
            });
        });

        const path = buildSmoothPath(curvePoints);
        const firstX = curvePoints[0]?.x ?? 0;
        const lastX = curvePoints[curvePoints.length - 1]?.x ?? width;
        sparkline.push(path);
        lineFill.push(`${path} L${lastX} 100 L${firstX} 100 Z`);
    }

    const latest = points.length
        ? points[points.length - 1]?.value
        : (Number.isFinite(currentValue) ? currentValue : null);
    const latestText = latest == null ? _('N/A') : `${safeFormatNumber(latest, 1)} ${unit}`;

    return (
        <div
            className={`nvidia-gpu-chart${className ? ` ${className}` : ''}`}
            style={{ color }}
        >
            <div className="nvidia-gpu-chart__title">{title}</div>
            <div className="nvidia-gpu-chart__value">{latestText}</div>
            <div className="nvidia-gpu-chart__svg-wrap" role="img" aria-label={`${title} ${latestText}`}>
                {noData
                    ? <div className="nvidia-gpu-chart__empty">{_('waiting for data…')}</div>
                    : <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="nvidia-gpu-chart__svg">
                        <defs>
                            <linearGradient id={`nvidia-gpu-gradient-${chartIdText}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                                <stop offset="100%" stopColor={color} stopOpacity="0.04" />
                            </linearGradient>
                        </defs>
                        {gridLines.map(level => (
                            <line key={`grid-${chartIdText}-${level}`} className="nvidia-gpu-chart__gridline" x1="0" x2={width} y1={level} y2={level} />
                        ))}
                        <path
                            className="nvidia-gpu-chart__area"
                            d={lineFill.join(' ')}
                            fill={`url(#nvidia-gpu-gradient-${chartIdText})`}
                        />
                        <path
                            className="nvidia-gpu-chart__line"
                            d={sparkline.join(' ')}
                            fill="none"
                            stroke={color}
                            strokeWidth="1.8"
                            strokeOpacity="0.95"
                        />
                    </svg>
                }
            </div>
        </div>
    );
}

function GpuHistoryCharts({ history }) {
    const data = useMemo(() => history.slice(-120), [history]);
    const historyWithPercent = useMemo(() =>
        data.map(item => ({ value: item.utilizationGpu })), [data]);
    const memoryPercent = useMemo(() => data.map(item => {
        if (item.memoryUsed == null || item.memoryTotal == null)
            return { value: null };
        return { value: (item.memoryUsed / item.memoryTotal) * 100 };
    }), [data]);
    const powerData = useMemo(() => data.map(item => ({ value: item.powerDraw })), [data]);
    const tempData = useMemo(() => data.map(item => ({ value: item.temperature })), [data]);
    const memoryTempData = useMemo(() => data.map(item => ({ value: item.memoryTemperature })), [data]);
    const ambientTempData = useMemo(() => data.map(item => ({ value: item.temperatureAmbient })), [data]);
    const clockData = useMemo(() => data.map(item => ({ value: item.clockSm })), [data]);
    const fanData = useMemo(() => data.map(item => ({ value: item.fanSpeed })), [data]);
    const pcieWidthData = useMemo(() => data.map(item => ({ value: item.pcieWidth })), [data]);
    const pcieBandwidthData = useMemo(() => data.map(item => ({ value: item.pcieBandwidth })), [data]);
    const pcieTxData = useMemo(() => data.map(item => ({ value: item.pcieTxThroughput })), [data]);
    const pcieRxData = useMemo(() => data.map(item => ({ value: item.pcieRxThroughput })), [data]);

    const hasPcieTx = pcieTxData.some(item => Number.isFinite(item.value));
    const hasPcieRx = pcieRxData.some(item => Number.isFinite(item.value));
    const hasMemoryTemp = memoryTempData.some(item => Number.isFinite(item.value));
    const hasAmbientTemp = ambientTempData.some(item => Number.isFinite(item.value));

    return (
        <div className="nvidia-gpu-chart-group">
            <ChartSection title={_('Core metrics')}>
                <Grid hasGutter>
                    <GridItem md={6} xl={3}>
                        <HistoryChart title={_('GPU Utilization')}
                                      unit="%"
                                      color={CHART_PURPLE_300}
                                      max={100}
                                      data={historyWithPercent} />
                    </GridItem>
                    <GridItem md={6} xl={3}>
                        <HistoryChart title={_('Memory')}
                                      unit="%"
                                      color={CHART_PURPLE_200}
                                      max={100}
                                      data={memoryPercent} />
                    </GridItem>
                    <GridItem md={6} xl={3}>
                        <HistoryChart title={_('Power')}
                                      unit="W"
                                      color={CHART_PURPLE_100}
                                      data={powerData} />
                    </GridItem>
                    <GridItem md={6} xl={3}>
                        <HistoryChart title={_('SM Clock')}
                                      unit="MHz"
                                      color={CHART_PURPLE_300}
                                      data={clockData} />
                    </GridItem>
                    <GridItem md={6} xl={3}>
                        <HistoryChart title={_('Fan')}
                                      unit="%"
                                      color={CHART_PURPLE_200}
                                      max={100}
                                      data={fanData} />
                    </GridItem>
                </Grid>
            </ChartSection>

            <ChartSection title={_('Thermals')} className="nvidia-gpu-chart-section--thermals">
                <Grid hasGutter>
                    <GridItem md={6} xl={3}>
                        <HistoryChart title={_('Temperature')}
                                      unit="°C"
                                      color={CHART_PURPLE_300}
                                      max={110}
                                      data={tempData} />
                    </GridItem>
                    {hasMemoryTemp ? (
                        <GridItem md={6} xl={3}>
                            <HistoryChart title={_('Memory temperature')}
                                          unit="°C"
                                          color={CHART_PURPLE_200}
                                          max={110}
                                          data={memoryTempData} />
                        </GridItem>
                    ) : null}
                    {hasAmbientTemp ? (
                        <GridItem md={6} xl={3}>
                            <HistoryChart title={_('Ambient temperature')}
                                          unit="°C"
                                          color={CHART_PURPLE_100}
                                          max={110}
                                          data={ambientTempData} />
                        </GridItem>
                    ) : null}
                </Grid>
            </ChartSection>

            <ChartSection title={_('PCIe link')} className="nvidia-gpu-chart-section--pcie">
                <Grid hasGutter>
                    <GridItem md={6} xl={3}>
                        <HistoryChart title={_('PCIe Width')}
                                      unit=""
                                      color={CHART_PURPLE_300}
                                      data={pcieWidthData} />
                    </GridItem>
                    <GridItem md={6} xl={3}>
                        <HistoryChart title={_('PCIe bandwidth (theoretical)')}
                                      unit="Gb/s"
                                      color={CHART_PURPLE_200}
                                      data={pcieBandwidthData} />
                    </GridItem>
                    {hasPcieTx ? (
                        <GridItem md={6} xl={3}>
                            <HistoryChart title={_('PCIe Tx throughput')}
                                          unit="B/s"
                                          color={CHART_PURPLE_300}
                                          data={pcieTxData} />
                        </GridItem>
                    ) : null}
                    {hasPcieRx ? (
                        <GridItem md={6} xl={3}>
                            <HistoryChart title={_('PCIe Rx throughput')}
                                          unit="B/s"
                                          color={CHART_PURPLE_100}
                                          data={pcieRxData} />
                        </GridItem>
                    ) : null}
                </Grid>
            </ChartSection>
        </div>
    );
}

function GpuCard({ gpu, history, usageSummary = {} }) {
    const historyPoints = history || [];
    const memUsed = gpu.memoryUsed;
    const memTotal = gpu.memoryTotal;
    const memPct = memUsed != null && memTotal ? (memUsed / memTotal) * 100 : null;
    const powerCap = gpu.powerDefaultLimit != null ? gpu.powerDefaultLimit : gpu.powerLimit;
    const powerPercent = gpu.powerDraw != null && powerCap ? (gpu.powerDraw / powerCap) * 100 : null;
    const tempStats = calcSeriesStats(historyPoints.map(p => p.temperature).filter(v => v != null).concat([gpu.temperature]).filter(v => Number.isFinite(v)));
    const memTempStats = calcSeriesStats(historyPoints.map(p => p.memoryTemperature).filter(v => v != null).concat([gpu.memoryTemperature]).filter(v => Number.isFinite(v)));
    const ambientTempStats = calcSeriesStats(historyPoints.map(p => p.temperatureAmbient).filter(v => v != null).concat([gpu.temperatureAmbient]).filter(v => Number.isFinite(v)));
    const utilHistory = historyPoints.map(item => ({
        t: item.t,
        value: Number.isFinite(item.utilizationGpu) ? item.utilizationGpu : null,
    }));
    const memUsedHistory = historyPoints.map(item => ({
        t: item.t,
        value: Number.isFinite(item.memoryUsed) && Number.isFinite(item.memoryTotal) && item.memoryTotal > 0
            ? (item.memoryUsed / item.memoryTotal) * 100
            : null,
    }));
    const powerHistory = historyPoints.map(item => ({
        t: item.t,
        value: Number.isFinite(item.powerDraw) && Number.isFinite(item.powerLimit) && item.powerLimit > 0
            ? (item.powerDraw / item.powerLimit) * 100
            : null,
    }));
    const tempHistory = historyPoints.map(item => ({
        t: item.t,
        value: Number.isFinite(item.temperature) ? item.temperature : null,
    }));

    const powerText = powerCap != null
        ? `${formatWatt(gpu.powerDraw)} / ${formatWatt(powerCap)} (${formatPercent(powerPercent)})`
        : `${formatWatt(gpu.powerDraw)} ${_('/')} ${_('N/A')}`;
    const clockText = `${gpu.clockSm != null ? `${gpu.clockSm} MHz` : _('N/A')}${gpu.clockMaxSm != null ? ` / ${gpu.clockMaxSm} MHz` : ''}`;
    const pcieCurrentGen = toNumber(gpu.pcieGenCurrent != null ? gpu.pcieGenCurrent : gpu.pcieGen);
    const pcieCurrentWidth = toNumber(gpu.pcieWidthCurrent != null ? gpu.pcieWidthCurrent : gpu.pcieWidth);
    const pcieCurrentDetailText = [
        gpu.pcieGenCurrentDevice != null ? `Device ${gpu.pcieGenCurrentDevice}` : null,
        gpu.pcieGenCurrentHost != null ? `Host ${gpu.pcieGenCurrentHost}` : null,
    ].filter(Boolean).join(' / ');
    const pcieCurrentText = `${pcieCurrentGen != null ? `Gen ${pcieCurrentGen}` : _('N/A')}, ${pcieCurrentWidth != null ? `${pcieCurrentWidth}x` : _('N/A')}`;
    const pcieMaxText = `${gpu.pcieGenMax != null ? `Gen ${gpu.pcieGenMax}` : _('N/A')}, ${gpu.pcieWidthMax != null ? `${gpu.pcieWidthMax}x` : _('N/A')}`;
    const pcieMaxDetailText = [
        gpu.pcieGenMaxDevice != null ? `Device ${gpu.pcieGenMaxDevice}` : null,
        gpu.pcieGenMaxHost != null ? `Host ${gpu.pcieGenMaxHost}` : null,
    ].filter(Boolean).join(' / ');
    const pcieBandwidthText = gpu.pcieBandwidth != null
        ? `${safeFormatNumber(gpu.pcieBandwidth, 1)} ${_('Gb/s')}`
        : `${_('N/A')}`;
    const pcieBandwidthMaxText = gpu.pcieBandwidthMax != null
        ? `${safeFormatNumber(gpu.pcieBandwidthMax, 1)} ${_('Gb/s')}`
        : `${_('N/A')}`;
    const tempLimitText = gpu.temperatureMaxThreshold != null ? formatTemp(gpu.temperatureMaxThreshold) : _('N/A');
    const pcieTxText = formatPcieThroughput(gpu.pcieTxThroughput);
    const pcieRxText = formatPcieThroughput(gpu.pcieRxThroughput);
    const chartSeed = gpu.uuid || gpu.index || gpu.name || 'gpu';

    return (
        <Card className="nvidia-gpu-card">
            <CardHeader>
                <CardTitle>
                    <Flex className="nvidia-gpu-card__title" alignItems={{ default: 'alignItemsCenter' }}>
                        <FlexItem className="nvidia-gpu-card__title-main">
                            <div className="nvidia-gpu-card__title-line">
                                <span className="nvidia-gpu-card__title-left">
                                    <span>{gpu.name}</span>
                                    {gpu.pcibusid ? (
                                        <Badge isRead className="nvidia-gpu-card__title-badge">{gpu.pcibusid}</Badge>
                                    ) : null}
                                </span>
                            </div>
                            <div className="nvidia-gpu-card__title-meta">
                                <span className="nvidia-gpu-card__sub">
                                    {_('Index')} {gpu.index} · {gpu.uuid || _('N/A')}
                                </span>
                            </div>
                        </FlexItem>
                    </Flex>
                </CardTitle>
            </CardHeader>
            <CardBody className="nvidia-gpu-card__body">
                <div className="nvidia-gpu-card__section-title" aria-hidden="true">
                    {_('GPU utilization by period')}
                </div>
                <div className="nvidia-gpu-card__period-summary" aria-label={_('GPU utilization by period')}>
                    <div className="nvidia-gpu-card__period-item">
                        <div>{_('Last 24 hours')}</div>
                        <div className="nvidia-gpu-card__period-meta nvidia-gpu-card__period-meta--value nvidia-gpu-card__period-highlight">
                            {_('Used')} {formatUsageHours(usageSummary.dayInUseMs)}
                        </div>
                        <div className="nvidia-gpu-card__period-meta">
                            {_('Avg while in use')}
                        </div>
                        <strong className="nvidia-gpu-card__period-highlight">
                            {formatUsagePercent(usageSummary.dayInUsePercent ?? usageSummary.day)}
                        </strong>
                    </div>
                    <div className="nvidia-gpu-card__period-item">
                        <div>{_('Last 7 days')}</div>
                        <div className="nvidia-gpu-card__period-meta nvidia-gpu-card__period-meta--value nvidia-gpu-card__period-highlight">
                            {_('Used')} {formatUsageHours(usageSummary.weekInUseMs)}
                        </div>
                        <div className="nvidia-gpu-card__period-meta">
                            {_('Avg while in use')}
                        </div>
                        <strong className="nvidia-gpu-card__period-highlight">
                            {formatUsagePercent(usageSummary.weekInUsePercent ?? usageSummary.week)}
                        </strong>
                    </div>
                    <div className="nvidia-gpu-card__period-item">
                        <div>{_('Last 30 days')}</div>
                        <div className="nvidia-gpu-card__period-meta nvidia-gpu-card__period-meta--value nvidia-gpu-card__period-highlight">
                            {_('Used')} {formatUsageHours(usageSummary.monthInUseMs)}
                        </div>
                        <div className="nvidia-gpu-card__period-meta">
                            {_('Avg while in use')}
                        </div>
                        <strong className="nvidia-gpu-card__period-highlight">
                            {formatUsagePercent(usageSummary.monthInUsePercent ?? usageSummary.month)}
                        </strong>
                    </div>
                </div>
                <div className="nvidia-gpu-card__quick-grid">
                    <div className="nvidia-gpu-card__stat-block">
                        <div className="nvidia-gpu-card__stat-label">{_('GPU Utilization')}</div>
                        <div className="nvidia-gpu-card__stat-value">{formatPercent(gpu.utilizationGpu)}</div>
                        <Progress value={clamp01(gpu.utilizationGpu, 0)} min={0} max={100} aria-label={_('GPU util')} />
                    </div>
                    <div className="nvidia-gpu-card__stat-block">
                        <div className="nvidia-gpu-card__stat-label">{_('Memory')}</div>
                        <div className="nvidia-gpu-card__stat-value">
                            {formatBytes(memUsed)} / {formatBytes(memTotal)}
                        </div>
                        <Progress value={clamp01(memPct || 0, 0)} min={0} max={100} aria-label={_('Memory util')} />
                    </div>
                    <div className="nvidia-gpu-card__stat-block">
                        <div className="nvidia-gpu-card__stat-label">{_('Power')}</div>
                        <div className="nvidia-gpu-card__stat-value">{powerText}</div>
                        <Progress value={clamp01(powerPercent || 0, 0)} min={0} max={100} aria-label={_('Power util')} />
                    </div>
                </div>
                <div className="nvidia-gpu-card__charts">
                    <div className="nvidia-gpu-card__chart-cell nvidia-gpu-card__chart-cell--spark nvidia-gpu-card__chart-cell--sparkline">
                        <HistoryChart
                            title={_('GPU util')}
                            unit="%"
                            color={CHART_PURPLE_300}
                            className="nvidia-gpu-chart--mini"
                            currentValue={gpu.utilizationGpu}
                            max={100}
                            chartId={`${chartSeed}-gpu-util`}
                            data={utilHistory}
                        />
                    </div>
                    <div className="nvidia-gpu-card__chart-cell nvidia-gpu-card__chart-cell--spark nvidia-gpu-card__chart-cell--sparkline">
                        <HistoryChart
                            title={_('Memory util')}
                            unit="%"
                            color={CHART_PURPLE_200}
                            className="nvidia-gpu-chart--mini"
                            currentValue={memPct}
                            max={100}
                            chartId={`${chartSeed}-memory-util`}
                            data={memUsedHistory}
                        />
                    </div>
                    <div className="nvidia-gpu-card__chart-cell nvidia-gpu-card__chart-cell--spark nvidia-gpu-card__chart-cell--sparkline">
                        <HistoryChart
                            title={_('Temp')}
                            unit="°C"
                            color={CHART_PURPLE_100}
                            className="nvidia-gpu-chart--mini"
                            currentValue={gpu.temperature}
                            max={110}
                            chartId={`${chartSeed}-temp`}
                            data={tempHistory}
                        />
                    </div>
                </div>
                <div className="nvidia-gpu-card__details">
                    <div className="nvidia-gpu-card__details-title">{_('More metrics')}</div>
                    <div className="nvidia-gpu-card__details-grid">
                        <MetricSection title={_('Temperature')} className="nvidia-gpu-metric-section--temperature nvidia-gpu-metric-section--inline-grid">
                            <DescriptionList>
                                <DescriptionListGroup>
                                    <DescriptionListTerm>{_('GPU')}</DescriptionListTerm>
                                    <DescriptionListDescription>{formatTempStatsLabel(gpu.temperature, tempStats)}</DescriptionListDescription>
                                </DescriptionListGroup>
                                <DescriptionListGroup>
                                    <DescriptionListTerm>{_('Memory')}</DescriptionListTerm>
                                    <DescriptionListDescription>{formatTempStatsLabel(gpu.memoryTemperature, memTempStats)}</DescriptionListDescription>
                                </DescriptionListGroup>
                                <DescriptionListGroup>
                                    <DescriptionListTerm>{_('Ambient')}</DescriptionListTerm>
                                    <DescriptionListDescription>{formatTempStatsLabel(gpu.temperatureAmbient, ambientTempStats)}</DescriptionListDescription>
                                </DescriptionListGroup>
                                <DescriptionListGroup>
                                    <DescriptionListTerm>{_('Threshold')}</DescriptionListTerm>
                                    <DescriptionListDescription>{tempLimitText}</DescriptionListDescription>
                                </DescriptionListGroup>
                            </DescriptionList>
                        </MetricSection>
                                <MetricSection title={_('PCIe')} className="nvidia-gpu-metric-section--pcie nvidia-gpu-metric-section--inline-grid">
                                    <DescriptionList>
                                        <DescriptionListGroup>
                                            <DescriptionListTerm>{_('Current Link')}</DescriptionListTerm>
                                            <DescriptionListDescription>
                                                {pcieCurrentText}
                                                {pcieCurrentDetailText ? ` (${pcieCurrentDetailText})` : ''}
                                            </DescriptionListDescription>
                                        </DescriptionListGroup>
                                        <DescriptionListGroup>
                                            <DescriptionListTerm>{_('Max Link')}</DescriptionListTerm>
                                            <DescriptionListDescription>
                                                {pcieMaxText}
                                                {pcieMaxDetailText ? ` (${pcieMaxDetailText})` : ''}
                                            </DescriptionListDescription>
                                        </DescriptionListGroup>
                                <DescriptionListGroup>
                                    <DescriptionListTerm>{_('Theoretical bandwidth')}</DescriptionListTerm>
                                    <DescriptionListDescription>{pcieBandwidthText} / {pcieBandwidthMaxText}</DescriptionListDescription>
                                </DescriptionListGroup>
                                <DescriptionListGroup>
                                    <DescriptionListTerm>{_('Tx / Rx')}</DescriptionListTerm>
                                    <DescriptionListDescription>{pcieTxText} / {pcieRxText}</DescriptionListDescription>
                                </DescriptionListGroup>
                                <DescriptionListGroup>
                                    <DescriptionListTerm>{_('Fan')}</DescriptionListTerm>
                                    <DescriptionListDescription>{formatPercent(gpu.fanSpeed)}</DescriptionListDescription>
                                </DescriptionListGroup>
                                <DescriptionListGroup>
                                    <DescriptionListTerm>{_('Clock')}</DescriptionListTerm>
                                    <DescriptionListDescription>{`SM ${clockText}`}</DescriptionListDescription>
                                </DescriptionListGroup>
                            </DescriptionList>
                        </MetricSection>
                    </div>
                </div>
            </CardBody>
        </Card>
    );
}

function ProcessesTable({ processes }) {
    const normalizedProcesses = processes.slice().sort((a, b) => {
        const memA = a.usedMemoryMiB || 0;
        const memB = b.usedMemoryMiB || 0;
        return memB - memA;
    }).slice(0, 50);

    if (normalizedProcesses.length === 0)
        return <p className="nvidia-gpu-empty-hint">{_('No GPU processes currently running')}</p>;

    return (
        <div className="nvidia-process-table" aria-label={_('GPU process list')}>
            <table className="nvidia-process-table__native">
                <thead>
                    <tr>
                        <th>{_('GPU')}</th>
                        <th>{_('PID')}</th>
                        <th>{_('Type')}</th>
                        <th>{_('Memory')}</th>
                        <th>{_('Process')}</th>
                    </tr>
                </thead>
                <tbody>
                    {normalizedProcesses.map((row, index) => (
                        <tr key={`${row.gpuName}-${row.pid}-${index}`}>
                            <td className="nvidia-process-table__gpu">{row.gpuName || _('N/A')}</td>
                            <td className="nvidia-process-table__pid">{row.pid}</td>
                            <td className="nvidia-process-table__type">{row.type || _('N/A')}</td>
                            <td className="nvidia-process-table__mem">
                                {row.usedMemoryMiB == null ? _('N/A') : `${safeFormatNumber(row.usedMemoryMiB)} MiB`}
                            </td>
                            <td className="nvidia-process-table__cmd">{row.processName || _('Unknown process')}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function UsageSummaryTable({ summary, rows }) {
    return (
        <Table variant={TableVariant.compact} className="nvidia-usage-table">
            <Thead>
                <Tr>
                    <Th>{_('Item')}</Th>
                    <Th>{_('Last 24 hours')}</Th>
                    <Th>{_('Last 7 days')}</Th>
                    <Th>{_('Last 30 days')}</Th>
                </Tr>
            </Thead>
            <Tbody>
                <Tr>
                    <Td>{_('GPU utilization')}</Td>
                    <Td>{formatUsagePercent(summary.day)}</Td>
                    <Td>{formatUsagePercent(summary.week)}</Td>
                    <Td>{formatUsagePercent(summary.month)}</Td>
                </Tr>
                <Tr>
                    <Td>{_('GPU memory utilization')}</Td>
                    <Td>{formatUsagePercent(summary.dayMemory)}</Td>
                    <Td>{formatUsagePercent(summary.weekMemory)}</Td>
                    <Td>{formatUsagePercent(summary.monthMemory)}</Td>
                </Tr>
                <Tr>
                    <Td>{_('GPU temperature')}</Td>
                    <Td>{formatTemp(summary.dayTemperature)}</Td>
                    <Td>{formatTemp(summary.weekTemperature)}</Td>
                    <Td>{formatTemp(summary.monthTemperature)}</Td>
                </Tr>
                {rows.map(row => (
                    <Tr key={row.id}>
                        <Td>
                            <div>{row.name}</div>
                            <div className="nvidia-gpu-usage-sub">{_('GPU')} {row.index || ''}</div>
                        </Td>
                        <Td>{formatUsagePercent(row.day)}</Td>
                        <Td>{formatUsagePercent(row.week)}</Td>
                        <Td>{formatUsagePercent(row.month)}</Td>
                    </Tr>
                ))}
            </Tbody>
        </Table>
    );
}

function App() {
    const [initialized, setInitialized] = useState(false);
    const [loading, setLoading] = useState(true);
    const [gpus, setGpus] = useState([]);
    const [histories, setHistories] = useState({});
    const [processes, setProcesses] = useState([]);
    const [stableProcessRows, setStableProcessRows] = useState([]);
    const [usageState, setUsageState] = useState(() => createUsageSummaryState());
    const [usageStateLoaded, setUsageStateLoaded] = useState(false);
    const [usageNowTs, setUsageNowTs] = useState(Date.now());
    const [error, setError] = useState(null);
    const [processError, setProcessError] = useState(null);
    const [activeTab, setActiveTab] = useState('gpus');
    const [lastUpdateAt, setLastUpdateAt] = useState(null);
    const lastTs = useRef(0);

    const visibleGpus = gpus;
    const sortedGpus = useMemo(() =>
        [...visibleGpus].sort((a, b) => a.index.localeCompare(b.index, undefined, { numeric: true })),
    [visibleGpus]);

    const averageUtilization = useMemo(() => {
        const values = visibleGpus
            .map(gpu => gpu.utilizationGpu)
            .filter(v => Number.isFinite(v));

        if (values.length === 0)
            return null;
        return values.reduce((sum, v) => sum + v, 0) / values.length;
    }, [visibleGpus]);

    const totalMemory = useMemo(() => {
        const valid = visibleGpus
            .filter(gpu => Number.isFinite(gpu.memoryTotal) && Number.isFinite(gpu.memoryUsed));
        return {
            total: valid.reduce((sum, gpu) => sum + gpu.memoryTotal, 0),
            used: valid.reduce((sum, gpu) => sum + gpu.memoryUsed, 0),
            count: valid.length,
        };
    }, [visibleGpus]);

    const processSummary = useMemo(() => {
        const usedMiB = stableProcessRows.reduce((sum, proc) => sum + (proc.usedMemoryMiB || 0), 0);
        return {
            rows: stableProcessRows,
            count: stableProcessRows.length,
            usedMiB,
        };
    }, [stableProcessRows]);

    const normalizedProcessRows = processSummary.rows;

    const usageSummary = useMemo(() => computeUsageSummary(usageState.gpus || {}, usageNowTs, sortedGpus.map(gpu => gpu.id)),
        [usageState, sortedGpus, usageNowTs]);

    const update = async (force = false) => {
        const now = Date.now();
        if (!force && now - lastTs.current < POLL_INTERVAL_MS)
            return;
        lastTs.current = now;

        try {
            const gpuBase = await queryGpuBase();
            let gpuStats = gpuBase;
            try {
                gpuStats = await queryGpuDetails(gpuStats);
            } catch (ex) {
                // optional details query failed; continue with base metrics
            }

            let procStats = [];
            try {
                procStats = await queryProcesses();
                setStableProcessRows(normalizeProcessRows(procStats, gpuStats));
                setProcessError(null);
            } catch (ex) {
                const lastKnown = Array.isArray(processes) ? processes : [];
                if (isRecoverableProcessQueryError(ex)) {
                    setProcessError(null);
                    procStats = lastKnown.length ? lastKnown : [];
                } else {
                    procStats = lastKnown.length ? lastKnown : [];
                    setProcessError(ex.message || _('Failed to get process table'));
                }
            }

            setGpus(gpuStats);
            setProcesses(procStats);
            setUsageState(prev => updateUsageSummaryUsage(prev, gpuStats, now));
            setUsageNowTs(now);
            setError(null);

            setHistories(prev => {
                const trimmedHistories = {};
                const nowTs = now;
                const cutoff = nowTs - HISTORY_WINDOW_MS;

                for (const gpu of gpuStats) {
                    if (!gpu.id)
                        continue;

                    const history = prev[gpu.id] || { points: [] };
                    const nextPoints = [...history.points, createHistoryEntry(gpu, nowTs)]
                        .filter(p => p.t >= cutoff)
                        .slice(-MAX_HISTORY_POINTS);
                    trimmedHistories[gpu.id] = {
                        gpu,
                        points: nextPoints,
                    };
                }

                return trimmedHistories;
            });
            setLoading(false);
            setInitialized(true);
            setLastUpdateAt(new Date(now).toLocaleTimeString());
        } catch (ex) {
            setError(ex.message || _('Unable to read GPU metrics'));
            setLoading(false);
            if (!initialized) {
                setLastUpdateAt(new Date(now).toLocaleTimeString());
            }
        }
    };

    useEffect(() => {
        let mounted = true;
        (async () => {
            const restored = await readUsageSummaryFromStorage();
            if (!mounted)
                return;
            setUsageState(restored);
            setUsageStateLoaded(true);
        })();

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!usageStateLoaded)
            return;
        void saveUsageSummaryToStorage(usageState);
    }, [usageState, usageStateLoaded]);

    useEffect(() => {
        let running = true;

        update();

        const timer = setInterval(() => {
            if (!running) return;
            update();
        }, POLL_INTERVAL_MS);

        return () => {
            running = false;
            clearInterval(timer);
        };
    }, []);

    const usageSummaryByGpu = useMemo(() => {
        const map = new Map();
        for (const row of usageSummary.gpuRows || [])
            map.set(row.id, row);
        return map;
    }, [usageSummary.gpuRows]);

    const gpuCards = sortedGpus.map(gpu => {
        const historyEntry = histories[gpu.id] || { points: [] };
        const summary = usageSummaryByGpu.get(gpu.id) || {};

        return (
            <div key={gpu.id} className="nvidia-gpu-card-stack-item">
                <GpuCard gpu={gpu} history={historyEntry.points} usageSummary={summary} />
            </div>
        );
    });

    if (loading && !initialized)
        return <EmptyStatePanel title={_('Loading GPU metrics...')} loading />;

    if (error && !initialized) {
        return (
            <>
                <Alert variant={AlertVariant.danger} title={_('Failed to initialize GPU monitor')} isInline>
                    <div>{error}</div>
                </Alert>
                <p className="nvidia-gpu-empty-hint">{_('Please check whether nvidia-smi exists and NVIDIA drivers are available.')}</p>
                <Button variant="primary" onClick={() => { window.location.reload(); }}>
                    {_("Retry")}
                </Button>
            </>
        );
    }

    return (
        <>
            <div className="nvidia-gpu-overview" role="group">
                <Card>
                    <CardTitle>
                        <span>{_('Real-time overview')}</span>
                        <span className="nvidia-gpu-page__version">{APP_VERSION}</span>
                    </CardTitle>
                    <CardBody>
                        <Grid hasGutter>
                            <GridItem sm={12} md={3}>
                                <div className="nvidia-gpu-overview__item">
                                    <div>{_('GPU Utilization Avg')}</div>
                                    <strong>{formatPercent(averageUtilization)}</strong>
                                </div>
                            </GridItem>
                            <GridItem sm={12} md={3}>
                                <div className="nvidia-gpu-overview__item">
                                    <div>{_('Total Memory Used')}</div>
                                    <strong>
                                        {formatBytes(totalMemory.used)} / {formatBytes(totalMemory.total)}
                                    </strong>
                                </div>
                            </GridItem>
                            <GridItem sm={12} md={3}>
                                <div className="nvidia-gpu-overview__item">
                                    <div>{_('Last update')}</div>
                                    <strong>{lastUpdateAt ? lastUpdateAt : new Date().toLocaleTimeString()}</strong>
                                </div>
                            </GridItem>
                            <GridItem sm={12} md={3}>
                                <div className="nvidia-gpu-overview__item">
                                    <div>{_('GPU processes')}</div>
                                    <strong>
                                        {processSummary.count} {_('running')} · {safeFormatNumber(processSummary.usedMiB)} MiB
                                    </strong>
                                </div>
                            </GridItem>
                        </Grid>
                        <div className="nvidia-gpu-overview__processes">
                            <div className="nvidia-gpu-overview__processes-title">{_('Running processes')}</div>
                            {normalizedProcessRows.length > 0
                                ? <ProcessesTable processes={normalizedProcessRows} />
                                : <p className="nvidia-gpu-empty-hint">{_('No GPU processes currently running')}</p>
                            }
                        </div>
                    </CardBody>
                </Card>
            </div>

            {error
                ? <Alert className="nvidia-gpu-error" variant={AlertVariant.warning} title={_('Partial refresh error')} isInline>
                    <div>{error}</div>
                </Alert>
                : null}

            {processError
                ? <Alert className="nvidia-gpu-error" variant={AlertVariant.warning} title={_('Process table update warning')} isInline>
                    <div>{processError}</div>
                </Alert>
                : null}

            {loading
                ? <div className="nvidia-gpu-loading"><Spinner isInline /> {_('Updating...')}</div>
                : null}

            {usageSummary.overall && sortedGpus.length > 0 ? (
                <Card>
                    <CardTitle>{_('Historical usage summary')}</CardTitle>
                    <CardBody>
                        <UsageSummaryTable summary={usageSummary.overall} rows={usageSummary.gpuRows} />
                    </CardBody>
                </Card>
            ) : null}

            <Tabs
                activeKey={activeTab}
                onSelect={(_, key) => setActiveTab(`${key}`)}
            >
                <Tab eventKey="gpus" title={<TabTitleText>{_('GPUs')}</TabTitleText>}>
                    <div className="nvidia-gpu-card-stack" role="group">
                        <div className="nvidia-gpu-overview" role="group">
                            {sortedGpus.length === 0 ? (
                                <div className="nvidia-gpu-empty">{_('No GPU detected')}</div>
                            ) : gpuCards}
                        </div>
                    </div>
                </Tab>
                <Tab eventKey="process" title={<TabTitleText>{_('Compute processes')}</TabTitleText>}>
                    <Card>
                        <CardTitle>{_('GPU compute processes')}</CardTitle>
                        <CardBody>
                            <ProcessesTable processes={normalizedProcessRows} />
                        </CardBody>
                    </Card>
                </Tab>
            </Tabs>
        </>
    );
}

function init() {
    const mountPoint = document.getElementById('gpu-monitor-page-root') || document.getElementById('gpu-monitor-page');
    if (!mountPoint)
        return;

    const ensurePluginCss = () => {
        const script = document.querySelector('script[src*=\"cockpit-gpu.js\"]');
        const styleHref = script ? new URL('cockpit-gpu.css', script.src).toString() : null;
        if (!styleHref)
            return;

        const alreadyLoaded = Array.from(document.styleSheets).some(sheet => {
            try {
                return sheet.href === styleHref;
            } catch (_error) {
                return false;
            }
        });

        if (alreadyLoaded)
            return;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = styleHref;
        document.head.appendChild(link);
    };

    ensurePluginCss();

    let rootMount = mountPoint;
    if (mountPoint === document.documentElement || mountPoint === document.body) {
        const fallback = document.createElement('div');
        fallback.id = 'gpu-monitor-page-root';
        fallback.className = 'ct-page-fill nvidia-gpu-page';

        const host = document.body || mountPoint;
        host.appendChild(fallback);
        rootMount = fallback;
    } else {
        mountPoint.classList.add('ct-page-fill', 'nvidia-gpu-page');
    }

    const root = createRoot(rootMount);
    root.render(<App />);
    document.body.removeAttribute('hidden');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
