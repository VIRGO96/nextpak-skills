import 'server-only';

// Demo in-memory store. In a real project this is Prisma/Drizzle/etc.
export type ProjectRow = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  internalNotes: string; // never sent to the client
  createdAt: Date;
};

const projects = new Map<string, ProjectRow>();

export const db = {
  project: {
    async findManyByOwner(ownerId: string) {
      return [...projects.values()].filter((p) => p.ownerId === ownerId);
    },
    async findById(id: string) {
      return projects.get(id) ?? null;
    },
    async create(data: Omit<ProjectRow, 'id' | 'createdAt' | 'internalNotes'>) {
      const row: ProjectRow = { ...data, id: crypto.randomUUID(), internalNotes: '', createdAt: new Date() };
      projects.set(row.id, row);
      return row;
    },
    async delete(id: string) {
      projects.delete(id);
    },
    async _reset() {
      projects.clear();
    },
  },
};
