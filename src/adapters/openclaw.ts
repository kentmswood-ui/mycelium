import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ToolAdapter } from './adapter.js'

const h = homedir()

// NOTE (verified 2026-06-15 against the live install): OpenClaw keeps its skills in
// the INSTALL directory (D:\OpenClaw\skills), not under ~/.openclaw. They use the
// standard SKILL.md format but are gated by skills-lock.json (each skill carries a
// github source + computedHash), so OpenClaw may ignore unmanaged files dropped into
// that dir. Until that ingestion path is confirmed, OpenClaw is treated as SYNC-ONLY
// and a sync-target candidate, NOT a live MCP consumer.
//
// Also verified: openclaw.json has NO mcp-server config key, so we cannot assume MCP
// support. capabilities.supportsMcp is therefore false — OpenClaw degrades to the
// static-sync path per spec §10.1. Revisit in a later phase if OpenClaw exposes MCP.
const OPENCLAW_INSTALL_DIR = process.env.OPENCLAW_HOME ?? 'D:\\OpenClaw'

export const openclawAdapter: ToolAdapter = {
  id: 'openclaw',
  homeMarker: join(h, '.openclaw'),
  skillsDir: join(OPENCLAW_INSTALL_DIR, 'skills'),
  instructionFile: join(h, '.openclaw', 'openclaw.json'),
  capabilities: { supportsMcp: false, supportsHooks: true },
}
