/**
 * PIX Data Provider — Contract
 * ═══════════════════════════════════════════════════════════════
 *
 * The interface every PIX data source must implement, whether it's the
 * real BACEN PIX API connector or the demo generator. Routes depend on
 * this abstraction, not on a concrete implementation — so connecting a
 * customer's real source is a config change, not a code rewrite.
 */

export interface PixReceivedTransaction {
  endToEndId: string;
  txid?: string;
  valor: string;          // BACEN returns decimal strings, e.g. "100.00"
  horario: string;        // ISO timestamp
  pagador?: {
    nome?: string;
    cpf?: string;
    cnpj?: string;
  };
  infoPagador?: string;
}

export interface PixMetricsSnapshot {
  timestamp: string;
  volumeTotal: number;
  transactionCount: number;
  fraudRate: number;
  availability: number;
  avgLatencyMs: number;
}

export interface PixProviderHealth {
  connected: boolean;
  /** 'real' when a live source answers; 'demo' when synthetic. */
  mode: 'real' | 'demo';
  /** Present when not connected: why. */
  reason?: string;
  circuit?: { state: string; failures: number };
  checkedAt: string;
}

export interface PixDataProvider {
  readonly name: string;
  /** Reports whether this provider is truly connected to a live source. */
  health(): Promise<PixProviderHealth>;
  /** Aggregate metrics for dashboards. */
  getMetrics(): Promise<PixMetricsSnapshot>;
  /**
   * List received PIX transactions in a window.
   * Mirrors BACEN GET /pix (inicio/fim/paginação).
   */
  listReceived(params: { inicio: string; fim: string; page?: number }): Promise<{
    transactions: PixReceivedTransaction[];
    total: number;
  }>;
}
