import { 
  users, 
  alertSubscriptions, 
  alertHistory,
  type User, 
  type InsertUser,
  type AlertSubscription,
  type InsertAlertSubscription,
  type AlertHistory,
  type InsertAlertHistory
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gt, sql } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Alert subscription methods
  createAlertSubscription(subscription: InsertAlertSubscription): Promise<AlertSubscription>;
  getAlertSubscription(email: string): Promise<AlertSubscription | undefined>;
  getAllActiveSubscriptions(): Promise<AlertSubscription[]>;
  updateAlertSubscription(id: number, subscription: InsertAlertSubscription): Promise<AlertSubscription>;
  updateLastAlertSent(subscriptionId: number): Promise<void>;
  
  // Alert history methods
  createAlertHistory(history: InsertAlertHistory): Promise<AlertHistory>;
  getRecentAlerts(subscriptionId: number, hours: number): Promise<AlertHistory[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Alert subscription methods
  async createAlertSubscription(subscription: InsertAlertSubscription): Promise<AlertSubscription> {
    const [result] = await db
      .insert(alertSubscriptions)
      .values(subscription)
      .returning();
    return result;
  }

  async getAlertSubscription(email: string): Promise<AlertSubscription | undefined> {
    const [subscription] = await db
      .select()
      .from(alertSubscriptions)
      .where(eq(alertSubscriptions.email, email));
    return subscription || undefined;
  }

  async getAllActiveSubscriptions(): Promise<AlertSubscription[]> {
    return await db
      .select()
      .from(alertSubscriptions)
      .where(eq(alertSubscriptions.isActive, true));
  }

  async updateAlertSubscription(id: number, subscription: InsertAlertSubscription): Promise<AlertSubscription> {
    const [result] = await db
      .update(alertSubscriptions)
      .set(subscription)
      .where(eq(alertSubscriptions.id, id))
      .returning();
    return result;
  }

  async updateLastAlertSent(subscriptionId: number): Promise<void> {
    await db
      .update(alertSubscriptions)
      .set({ lastAlertSent: new Date() })
      .where(eq(alertSubscriptions.id, subscriptionId));
  }

  // Alert history methods
  async createAlertHistory(history: InsertAlertHistory): Promise<AlertHistory> {
    const [result] = await db
      .insert(alertHistory)
      .values(history)
      .returning();
    return result;
  }

  async getRecentAlerts(subscriptionId: number, hours: number): Promise<AlertHistory[]> {
    const hoursAgo = new Date(Date.now() - hours * 60 * 60 * 1000);
    return await db
      .select()
      .from(alertHistory)
      .where(
        and(
          eq(alertHistory.subscriptionId, subscriptionId),
          gt(alertHistory.sentAt, hoursAgo)
        )
      );
  }
}

export const storage = new DatabaseStorage();
