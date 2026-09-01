import { and, eq } from 'drizzle-orm';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import { type NewRecordSet, type RecordSet, recordSets } from '../schema/index.js';

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\.$/, '');
}

function normalizeType(type: string): string {
  return type.trim().toUpperCase();
}

export class RecordSetRepository {
  constructor(private db: IDatabaseAdapter) {}

  async findById(id: string): Promise<RecordSet | null> {
    const result = await this.db.selectOne(recordSets, eq(recordSets.id, id));
    return result || null;
  }

  async findBySnapshotId(snapshotId: string): Promise<RecordSet[]> {
    const results = await this.db.selectWhere(recordSets, eq(recordSets.snapshotId, snapshotId));
    // Sort by type and name
    return results.sort((a, b) => {
      const typeCompare = a.type.localeCompare(b.type);
      if (typeCompare !== 0) return typeCompare;
      return a.name.localeCompare(b.name);
    });
  }

  async findByNameAndType(
    snapshotId: string,
    name: string,
    type: string
  ): Promise<RecordSet | null> {
    const condition = and(
      eq(recordSets.snapshotId, snapshotId),
      eq(recordSets.name, normalizeName(name)),
      eq(recordSets.type, normalizeType(type))
    );
    if (!condition) throw new Error('Expected record-set lookup predicates');

    const result = await this.db.selectOne(recordSets, condition);
    return result || null;
  }

  async create(data: NewRecordSet): Promise<RecordSet> {
    return this.db.insert(recordSets, data);
  }

  async createMany(data: NewRecordSet[]): Promise<RecordSet[]> {
    if (data.length === 0) return [];
    return this.db.insertMany(recordSets, data);
  }

  async update(id: string, data: Partial<NewRecordSet>): Promise<RecordSet | undefined> {
    return this.db.updateOne(recordSets, data, eq(recordSets.id, id));
  }
}
