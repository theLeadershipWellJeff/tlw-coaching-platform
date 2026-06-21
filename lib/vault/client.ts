/**
 * Read-only GitHub client for the mind-garden vault repo (TheLeadershipWell-Vault).
 *
 * The DEPLOYED app only ever READS the vault — all writes come from Claude Code or
 * the coach's Obsidian (which pushes up). So this uses a single app-level
 * fine-grained PAT with `contents: read`, plain `fetch` against the REST API (no
 * octokit dependency).
 *
 * Env:
 *   VAULT_GITHUB_TOKEN  — fine-grained PAT, contents:read, scoped to the vault repo
 *   VAULT_REPO          — "owner/name" (default theLeadershipWellJeff/TheLeadershipWell-Vault)
 *   VAULT_BRANCH        — default "main"
 */

const API = 'https://api.github.com'

export type VaultConfig = { owner: string; repo: string; branch: string; token: string }

/** Resolve vault config from env. Returns null when not configured (sync no-ops). */
export function getVaultConfig(): VaultConfig | null {
  const token = process.env.VAULT_GITHUB_TOKEN?.trim()
  if (!token) return null
  const repo = (process.env.VAULT_REPO || 'theLeadershipWellJeff/TheLeadershipWell-Vault').trim()
  const [owner, name] = repo.split('/')
  if (!owner || !name) return null
  return { owner, repo: name, branch: (process.env.VAULT_BRANCH || 'main').trim(), token }
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'tlw-coaching-platform',
  }
}

export type TreeEntry = { path: string; type: 'blob' | 'tree'; sha: string }

/**
 * One recursive Git Trees call → every path + per-file SHA for the branch, plus the
 * root tree SHA (a stable fingerprint of the whole tree; if unchanged since the last
 * sync, nothing changed and the sync can short-circuit).
 */
export async function getTree(
  cfg: VaultConfig
): Promise<{ rootSha: string; entries: TreeEntry[] }> {
  // Resolve the branch head commit → its tree sha.
  const branchRes = await fetch(
    `${API}/repos/${cfg.owner}/${cfg.repo}/branches/${encodeURIComponent(cfg.branch)}`,
    { headers: headers(cfg.token), cache: 'no-store' }
  )
  if (!branchRes.ok) {
    throw new Error(`Vault: cannot read branch ${cfg.branch} (${branchRes.status})`)
  }
  const branch = await branchRes.json()
  const rootSha: string = branch?.commit?.commit?.tree?.sha
  if (!rootSha) throw new Error('Vault: branch has no tree sha')

  const treeRes = await fetch(
    `${API}/repos/${cfg.owner}/${cfg.repo}/git/trees/${rootSha}?recursive=1`,
    { headers: headers(cfg.token), cache: 'no-store' }
  )
  if (!treeRes.ok) throw new Error(`Vault: cannot read tree (${treeRes.status})`)
  const tree = await treeRes.json()
  const entries: TreeEntry[] = (tree?.tree || [])
    .filter((e: any) => (e.type === 'blob' || e.type === 'tree') && typeof e.path === 'string')
    .map((e: any) => ({ path: e.path, type: e.type, sha: e.sha }))

  return { rootSha, entries }
}

/** Fetch a blob's UTF-8 content by its git blob SHA. */
export async function getBlob(cfg: VaultConfig, sha: string): Promise<string> {
  const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/git/blobs/${sha}`, {
    headers: headers(cfg.token),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Vault: cannot read blob ${sha} (${res.status})`)
  const blob = await res.json()
  if (blob?.encoding === 'base64' && typeof blob.content === 'string') {
    return Buffer.from(blob.content, 'base64').toString('utf8')
  }
  return typeof blob?.content === 'string' ? blob.content : ''
}

/**
 * Fetch a file's CURRENT content by path (used at draft time, Phase B, to pull the
 * live note body rather than anything cached). Returns null if missing.
 */
export async function getContentByPath(cfg: VaultConfig, path: string): Promise<string | null> {
  const res = await fetch(
    `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(cfg.branch)}`,
    { headers: headers(cfg.token), cache: 'no-store' }
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Vault: cannot read ${path} (${res.status})`)
  const file = await res.json()
  if (file?.encoding === 'base64' && typeof file.content === 'string') {
    return Buffer.from(file.content, 'base64').toString('utf8')
  }
  return typeof file?.content === 'string' ? file.content : null
}
