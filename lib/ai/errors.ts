/** Typed errors thrown by the AI gateway (kept dependency-free so budget.ts and client.ts share them). */
export type AiGatewayErrorCode =
  | 'not_configured'
  | 'unknown_model'
  | 'ledger_unavailable'
  | 'ledger_error'
  | 'price_error'
  | 'budget_exceeded'
  | 'disabled'

export class AiGatewayError extends Error {
  code: AiGatewayErrorCode
  constructor(code: AiGatewayErrorCode, message: string) {
    super(message)
    this.name = 'AiGatewayError'
    this.code = code
  }
}
