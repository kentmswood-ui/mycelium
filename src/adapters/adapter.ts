export interface Capabilities {
  supportsMcp: boolean
  supportsHooks: boolean
}

export interface ToolAdapter {
  id: string
  homeMarker: string // path under home that proves the tool is installed
  skillsDir: string // absolute skills dir
  instructionFile: string // global file to inject the consult rule
  capabilities: Capabilities
}
