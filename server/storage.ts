import { db } from "../db";
import { type User, type InsertUser, type PetRegistration, type InsertPetRegistration, type VetOfficer, type InsertVetOfficer, petRegistrations, users, vetOfficers } from "../shared/schema";
import { eq, or, ilike, and, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getVetOfficerByUsername(username: string): Promise<VetOfficer | undefined>;
  getVetOfficerByDispensary(dispensary: string): Promise<VetOfficer | undefined>;
  createVetOfficer(data: InsertVetOfficer): Promise<VetOfficer>;
  getAllVetOfficers(): Promise<VetOfficer[]>;
  updateVetOfficerPassword(id: number, newPassword: string): Promise<void>;
  
  createPetRegistration(data: InsertPetRegistration & { status: string; submittedBy: string; registrationNumber?: string; registrationDate?: string }): Promise<PetRegistration>;
  getPetRegistrationById(id: number): Promise<PetRegistration | undefined>;
  getPetRegistrationByNumber(registrationNumber: string): Promise<PetRegistration | undefined>;
  getAllPetRegistrations(): Promise<PetRegistration[]>;
  getRegistrationsByStatus(status: string): Promise<PetRegistration[]>;
  getRegistrationsByStatusAndDispensary(status: string, dispensary: string): Promise<PetRegistration[]>;
  searchPetRegistrations(query: string, filters?: { district?: string; species?: string; status?: string; dispensary?: string }): Promise<PetRegistration[]>;
  getRegistrationCountByDistrictAndSpecies(district: string, species: string): Promise<number>;
  getApprovedRegistrationCountBySpecies(species: string): Promise<number>;
  updateRegistrationStatus(registrationNumber: string, status: string, remarks?: { vetRemarks?: string; authorityRemarks?: string }): Promise<PetRegistration | undefined>;
  updateRegistrationStatusById(id: number, status: string, remarks?: { vetRemarks?: string; authorityRemarks?: string }): Promise<PetRegistration | undefined>;
  assignRegistrationNumber(id: number, registrationNumber: string, registrationDate: string, authorityRemarks?: string): Promise<PetRegistration | undefined>;
  approveRegistrationWithNumber(id: number, species: string, authorityRemarks?: string): Promise<PetRegistration | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getVetOfficerByUsername(username: string): Promise<VetOfficer | undefined> {
    const [vet] = await db.select().from(vetOfficers).where(eq(vetOfficers.username, username));
    return vet;
  }

  async getVetOfficerByDispensary(dispensary: string): Promise<VetOfficer | undefined> {
    const [vet] = await db.select().from(vetOfficers).where(eq(vetOfficers.dispensary, dispensary));
    return vet;
  }

  async createVetOfficer(data: InsertVetOfficer): Promise<VetOfficer> {
    const [vet] = await db.insert(vetOfficers).values(data).returning();
    return vet;
  }

  async getAllVetOfficers(): Promise<VetOfficer[]> {
    return await db.select().from(vetOfficers);
  }

  async updateVetOfficerPassword(id: number, newPassword: string): Promise<void> {
    await db.update(vetOfficers).set({ password: newPassword }).where(eq(vetOfficers.id, id));
  }

  async createPetRegistration(data: InsertPetRegistration & { status: string; submittedBy: string; registrationNumber?: string; registrationDate?: string }): Promise<PetRegistration> {
    const [registration] = await db.insert(petRegistrations).values(data).returning();
    return registration;
  }

  async getPetRegistrationById(id: number): Promise<PetRegistration | undefined> {
    const [registration] = await db.select().from(petRegistrations).where(eq(petRegistrations.id, id));
    return registration;
  }

  async getPetRegistrationByNumber(registrationNumber: string): Promise<PetRegistration | undefined> {
    const [registration] = await db.select().from(petRegistrations).where(eq(petRegistrations.registrationNumber, registrationNumber));
    return registration;
  }

  async getAllPetRegistrations(): Promise<PetRegistration[]> {
    return await db.select().from(petRegistrations).orderBy(petRegistrations.createdAt);
  }

  async getRegistrationsByStatus(status: string): Promise<PetRegistration[]> {
    return await db.select().from(petRegistrations).where(eq(petRegistrations.status, status)).orderBy(petRegistrations.createdAt);
  }

  async getRegistrationsByStatusAndDispensary(status: string, dispensary: string): Promise<PetRegistration[]> {
    return await db.select().from(petRegistrations).where(
      and(
        eq(petRegistrations.status, status),
        eq(petRegistrations.dispensary, dispensary)
      )
    ).orderBy(petRegistrations.createdAt);
  }

  async searchPetRegistrations(query: string, filters?: { district?: string; species?: string; status?: string; dispensary?: string }): Promise<PetRegistration[]> {
    const conditions = [];
    
    if (query) {
      const searchConditions = [
        ilike(petRegistrations.registrationNumber, `%${query}%`),
        ilike(petRegistrations.ownerName, `%${query}%`),
        ilike(petRegistrations.petName, `%${query}%`),
        eq(petRegistrations.mobile, query),
        ilike(petRegistrations.dispensary, `%${query}%`)
      ];
      
      const refMatch = query.match(/^(.+)-(\d+)-(.+)$/);
      if (refMatch) {
        const idFromRef = parseInt(refMatch[2], 10);
        if (!isNaN(idFromRef)) {
          searchConditions.push(eq(petRegistrations.id, idFromRef));
        }
      }
      
      const numericId = parseInt(query, 10);
      if (!isNaN(numericId) && query === numericId.toString() && numericId <= 2147483647) {
        searchConditions.push(eq(petRegistrations.id, numericId));
      }
      
      conditions.push(or(...searchConditions));
    }
    
    if (filters?.district && filters.district !== 'All') {
      conditions.push(eq(petRegistrations.district, filters.district));
    }
    
    if (filters?.species && filters.species !== 'All') {
      conditions.push(eq(petRegistrations.species, filters.species));
    }
    
    if (filters?.status && filters.status !== 'All') {
      const statuses = filters.status.split(',').map(s => s.trim());
      if (statuses.length === 1) {
        conditions.push(eq(petRegistrations.status, statuses[0]));
      } else {
        conditions.push(or(...statuses.map(s => eq(petRegistrations.status, s))));
      }
    }
    
    if (filters?.dispensary) {
      conditions.push(eq(petRegistrations.dispensary, filters.dispensary));
    }
    
    if (conditions.length === 0) {
      return await db.select().from(petRegistrations).orderBy(petRegistrations.createdAt);
    }
    
    return await db.select().from(petRegistrations).where(and(...conditions)).orderBy(petRegistrations.createdAt);
  }

  async getRegistrationCountByDistrictAndSpecies(district: string, species: string): Promise<number> {
    const results = await db.select().from(petRegistrations).where(
      and(
        eq(petRegistrations.district, district),
        eq(petRegistrations.species, species)
      )
    );
    return results.length;
  }

  async updateRegistrationStatus(registrationNumber: string, status: string, remarks?: { vetRemarks?: string; authorityRemarks?: string }): Promise<PetRegistration | undefined> {
    const updateData: any = { status };
    if (remarks?.vetRemarks) updateData.vetRemarks = remarks.vetRemarks;
    if (remarks?.authorityRemarks) updateData.authorityRemarks = remarks.authorityRemarks;
    
    const [updated] = await db.update(petRegistrations)
      .set(updateData)
      .where(eq(petRegistrations.registrationNumber, registrationNumber))
      .returning();
    return updated;
  }

  async getApprovedRegistrationCountBySpecies(species: string): Promise<number> {
    const results = await db.select().from(petRegistrations).where(
      and(
        eq(petRegistrations.status, 'approved'),
        eq(petRegistrations.species, species)
      )
    );
    return results.length;
  }

  async updateRegistrationStatusById(id: number, status: string, remarks?: { vetRemarks?: string; authorityRemarks?: string }): Promise<PetRegistration | undefined> {
    const updateData: any = { status };
    if (remarks?.vetRemarks) updateData.vetRemarks = remarks.vetRemarks;
    if (remarks?.authorityRemarks) updateData.authorityRemarks = remarks.authorityRemarks;
    
    const [updated] = await db.update(petRegistrations)
      .set(updateData)
      .where(eq(petRegistrations.id, id))
      .returning();
    return updated;
  }

  async assignRegistrationNumber(id: number, registrationNumber: string, registrationDate: string, authorityRemarks?: string): Promise<PetRegistration | undefined> {
    const updateData: any = { registrationNumber, registrationDate, status: 'approved' };
    if (authorityRemarks) updateData.authorityRemarks = authorityRemarks;
    
    const [updated] = await db.update(petRegistrations)
      .set(updateData)
      .where(eq(petRegistrations.id, id))
      .returning();
    return updated;
  }

  async approveRegistrationWithNumber(id: number, species: string, authorityRemarks?: string): Promise<PetRegistration | undefined> {
    const year = new Date().getFullYear();
    const registrationDate = new Date().toISOString().split('T')[0];
    
    const lockKey = species === 'Dog' ? 100001 : 100002;
    
    await db.execute(sql`SELECT pg_advisory_lock(${lockKey})`);
    
    try {
      const [currentReg] = await db.select().from(petRegistrations).where(eq(petRegistrations.id, id));
      
      if (!currentReg) {
        return undefined;
      }
      
      if (currentReg.registrationNumber && currentReg.status === 'approved') {
        return currentReg;
      }
      
      const countResult = await db.execute(sql`
        SELECT COALESCE(MAX(
          CASE 
            WHEN registration_number LIKE ${`JK/Kupwara/${species}/${year}/%`}
            THEN CAST(SPLIT_PART(registration_number, '/', 5) AS INTEGER)
            ELSE 0
          END
        ), 0) + 1 AS next_num
        FROM pet_registrations
        WHERE status = 'approved' AND species = ${species}
      `);
      
      const nextNum = (countResult.rows[0] as any)?.next_num || 1;
      const registrationNumber = `JK/Kupwara/${species}/${year}/${nextNum.toString().padStart(5, '0')}`;
      
      const updateData: any = { 
        registrationNumber, 
        registrationDate, 
        status: 'approved' 
      };
      if (authorityRemarks) updateData.authorityRemarks = authorityRemarks;
      
      const [updated] = await db.update(petRegistrations)
        .set(updateData)
        .where(eq(petRegistrations.id, id))
        .returning();
      
      return updated;
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${lockKey})`);
    }
  }
}

export const storage = new DatabaseStorage();
