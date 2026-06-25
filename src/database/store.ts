import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, Session, AuditEntry, Incident, PixAnomaly } from '../domain/types';

// ─────────────────────────────────────────
// In-memory store (replace with PostgreSQL in production)
// ─────────────────────────────────────────

class Database {
  users: Map<string, User> = new Map();
  sessions: Map<string, Session> = new Map();
  auditLog: AuditEntry[] = [];
  incidents: Map<string, Incident> = new Map();
  pixAnomalies: Map<string, PixAnomaly> = new Map();
  usedRefreshTokens: Set<string> = new Set(); // Prevent token reuse

  async seed() {
    // Hash passwords with bcrypt cost factor 12
    const adminHash = await bcrypt.hash('Admin@2024!Secure', 12);
    const analystHash = await bcrypt.hash('Analista@2024!Secure', 12);
    const directorHash = await bcrypt.hash('Diretor@2024!Secure', 12);
    const auditorHash = await bcrypt.hash('Auditor@2024!Secure', 12);

    const seedUsers: User[] = [
      {
        id: uuidv4(),
        name: 'Roberto Silva',
        email: 'roberto.silva@pixcompliance.com',
        passwordHash: adminHash,
        role: 'Admin',
        mfaEnabled: true,
        mfaSecret: 'JBSWY3DPEHPK3PXP', // Base32 secret for demo TOTP
        mfaVerified: true,
        active: true,
        loginAttempts: 0,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: uuidv4(),
        name: 'Ana Rodriguez',
        email: 'ana.rodriguez@pixcompliance.com',
        passwordHash: analystHash,
        role: 'Analista',
        mfaEnabled: true,
        mfaSecret: 'JBSWY3DPEHPK3PXQ',
        mfaVerified: true,
        active: true,
        loginAttempts: 0,
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
      },
      {
        id: uuidv4(),
        name: 'Carlos Santos',
        email: 'carlos.santos@pixcompliance.com',
        passwordHash: directorHash,
        role: 'Diretor',
        mfaEnabled: true,
        mfaSecret: 'JBSWY3DPEHPK3PXR',
        mfaVerified: true,
        active: true,
        loginAttempts: 0,
        createdAt: new Date('2024-01-03'),
        updatedAt: new Date('2024-01-03'),
      },
      {
        id: uuidv4(),
        name: 'Márcia Lima',
        email: 'marcia.lima@pixcompliance.com',
        passwordHash: auditorHash,
        role: 'Auditor',
        mfaEnabled: true,
        mfaSecret: 'JBSWY3DPEHPK3PXS',
        mfaVerified: true,
        active: true,
        loginAttempts: 0,
        createdAt: new Date('2024-01-04'),
        updatedAt: new Date('2024-01-04'),
      },
    ];

    seedUsers.forEach(u => this.users.set(u.id, u));

    // Seed incidents
    const incidentList: Incident[] = [
      {
        id: uuidv4(),
        title: 'Tentativa de Breach em Blockchain',
        description: 'Atividade suspeita detectada na camada Hyperledger Fabric',
        severity: 'critical',
        status: 'investigating',
        assignee: 'SOC Team Alpha',
        createdAt: new Date(Date.now() - 23 * 60000),
        updatedAt: new Date(Date.now() - 5 * 60000),
        slaDeadline: new Date(Date.now() + 2 * 3600000),
        tags: ['blockchain', 'breach', 'critical'],
      },
      {
        id: uuidv4(),
        title: 'Anomalia em Transações PIX',
        description: 'Volume 340% acima da média detectado nas últimas 2h',
        severity: 'high',
        status: 'open',
        assignee: 'PIX Security Team',
        createdAt: new Date(Date.now() - 60 * 60000),
        updatedAt: new Date(Date.now() - 10 * 60000),
        slaDeadline: new Date(Date.now() + 6 * 3600000),
        tags: ['pix', 'anomaly', 'volume'],
      },
      {
        id: uuidv4(),
        title: 'Falha em HSM - Nível 3',
        description: 'Hardware Security Module reportando erro de autenticação',
        severity: 'high',
        status: 'contained',
        assignee: 'Crypto Team',
        createdAt: new Date(Date.now() - 120 * 60000),
        updatedAt: new Date(Date.now() - 30 * 60000),
        slaDeadline: new Date(Date.now() + 4 * 3600000),
        tags: ['hsm', 'crypto', 'hardware'],
      },
    ];

    incidentList.forEach(i => this.incidents.set(i.id, i));

    // Seed anomalies
    const anomaliesList: PixAnomaly[] = [
      {
        id: uuidv4(),
        detectedAt: new Date(Date.now() - 5 * 60000),
        type: 'volume_spike',
        severity: 'high',
        description: 'Pico de 340% nas transações PIX nas últimas 2h',
        affectedTransactions: 12847,
        status: 'investigating',
      },
      {
        id: uuidv4(),
        detectedAt: new Date(Date.now() - 45 * 60000),
        type: 'geographic',
        severity: 'medium',
        description: 'Concentração anômala de transações na região Sul',
        affectedTransactions: 3421,
        status: 'open',
      },
    ];

    anomaliesList.forEach(a => this.pixAnomalies.set(a.id, a));
  }

  findUserByEmail(email: string): User | undefined {
    return [...this.users.values()].find(u => u.email === email);
  }

  findUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  saveSession(session: Session): void {
    this.sessions.set(session.id, session);
  }

  findSessionByRefreshToken(token: string): Session | undefined {
    return [...this.sessions.values()].find(s => s.refreshToken === token);
  }

  revokeSessionsByUserId(userId: string): void {
    this.sessions.forEach((s, id) => {
      if (s.userId === userId) {
        this.sessions.set(id, { ...s, revoked: true });
      }
    });
  }

  revokeSessionsByFamily(tokenFamily: string): void {
    this.sessions.forEach((s, id) => {
      if (s.tokenFamily === tokenFamily) {
        this.sessions.set(id, { ...s, revoked: true });
      }
    });
  }
}

export const db = new Database();
