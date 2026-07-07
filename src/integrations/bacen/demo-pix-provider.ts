import {
  PixDataProvider, PixProviderHealth, PixMetricsSnapshot, PixReceivedTransaction,
} from './pix-provider';

/**
 * Demo PIX Provider
 * ═══════════════════════════════════════════════════════════════
 *
 * Implements the same PixDataProvider contract as the real connector,
 * but returns synthetic data. It ALWAYS reports mode:'demo' and
 * connected:false in its health check, so the platform can label every
 * value it produces as demonstrative. Used when no real BACEN
 * credentials/certificate are configured.
 */
export class DemoPixProvider implements PixDataProvider {
  readonly name = 'bacen-pix-api';

  async health(): Promise<PixProviderHealth> {
    return {
      connected: false,
      mode: 'demo',
      reason: 'Nenhuma credencial/certificado BACEN configurado. Usando dados demonstrativos.',
      checkedAt: new Date().toISOString(),
    };
  }

  async getMetrics(): Promise<PixMetricsSnapshot> {
    const jitter = () => (Math.random() - 0.5) * 0.02;
    return {
      timestamp: new Date().toISOString(),
      volumeTotal: 2.4e9 * (1 + jitter()),
      transactionCount: Math.floor(847000 * (1 + jitter())),
      fraudRate: Math.max(0, 0.02 + jitter() * 0.1),
      availability: Math.min(100, 99.97 + jitter() * 0.01),
      avgLatencyMs: Math.max(80, 120 + jitter() * 20),
    };
  }

  async listReceived(params: { inicio: string; fim: string; page?: number }): Promise<{
    transactions: PixReceivedTransaction[]; total: number;
  }> {
    const count = 20;
    const transactions: PixReceivedTransaction[] = Array.from({ length: count }, (_, i) => ({
      endToEndId: `E${String(Date.now())}${String(i).padStart(4, '0')}`,
      txid: `demo-txid-${i}`,
      valor: (Math.random() * 5000 + 10).toFixed(2),
      horario: new Date(Date.now() - i * 60_000).toISOString(),
      pagador: { nome: 'Pagador Demonstrativo', cpf: '***.***.***-**' },
      infoPagador: 'Transação demonstrativa',
    }));
    return { transactions, total: count };
  }
}
