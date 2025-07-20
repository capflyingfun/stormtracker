import { 
  users, 
  alertSubscriptions, 
  alertHistory,
  messageInbox,
  threatDetection,
  type User, 
  type InsertUser,
  type AlertSubscription,
  type InsertAlertSubscription,
  type AlertHistory,
  type InsertAlertHistory,
  type MessageInbox,
  type InsertMessageInbox,
  type ThreatDetection,
  type InsertThreatDetection
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
  
  // Message inbox methods (built-in email/text system)
  createMessage(message: InsertMessageInbox): Promise<MessageInbox>;
  getMessages(subscriptionId: number): Promise<MessageInbox[]>;
  getUnreadMessages(subscriptionId: number): Promise<MessageInbox[]>;
  getAllMessages(limit?: number): Promise<MessageInbox[]>;
  markMessageAsRead(messageId: number): Promise<void>;
  deleteMessage(messageId: number): Promise<void>;
  
  // Threat detection methods
  createThreatDetection(threat: InsertThreatDetection): Promise<ThreatDetection>;
  getActiveThreatsBySubscription(subscriptionId: number): Promise<ThreatDetection[]>;
  getAllAlertSubscriptions(): Promise<AlertSubscription[]>;
  updateThreatDetection(id: number, updates: Partial<InsertThreatDetection>): Promise<void>;
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
      )
      .orderBy(alertHistory.sentAt);
  }

  // Message inbox methods (built-in email/text system)
  async createMessage(message: InsertMessageInbox): Promise<MessageInbox> {
    const [result] = await db
      .insert(messageInbox)
      .values(message)
      .returning();
    return result;
  }

  async getMessages(subscriptionId: number): Promise<MessageInbox[]> {
    return await db
      .select()
      .from(messageInbox)
      .where(eq(messageInbox.subscriptionId, subscriptionId))
      .orderBy(sql`${messageInbox.sentAt} DESC`);
  }

  async getUnreadMessages(subscriptionId: number): Promise<MessageInbox[]> {
    return await db
      .select()
      .from(messageInbox)
      .where(
        and(
          eq(messageInbox.subscriptionId, subscriptionId),
          eq(messageInbox.isRead, false)
        )
      )
      .orderBy(sql`${messageInbox.sentAt} DESC`);
  }

  async getAllMessages(limit: number = 50): Promise<MessageInbox[]> {
    return await db
      .select()
      .from(messageInbox)
      .orderBy(sql`${messageInbox.sentAt} DESC`)
      .limit(limit);
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    await db
      .update(messageInbox)
      .set({ 
        isRead: true, 
        readAt: new Date()
      })
      .where(eq(messageInbox.id, messageId));
  }

  async deleteMessage(messageId: number): Promise<void> {
    await db
      .delete(messageInbox)
      .where(eq(messageInbox.id, messageId));
  }

  // Threat detection methods
  async createThreatDetection(threat: InsertThreatDetection): Promise<ThreatDetection> {
    const [result] = await db
      .insert(threatDetection)
      .values(threat)
      .returning();
    return result;
  }

  async getActiveThreatsBySubscription(subscriptionId: number): Promise<ThreatDetection[]> {
    return await db
      .select()
      .from(threatDetection)
      .where(
        and(
          eq(threatDetection.subscriptionId, subscriptionId),
          eq(threatDetection.threatStatus, 'active')
        )
      )
      .orderBy(sql`${threatDetection.detectedAt} DESC`);
  }

  async getAllAlertSubscriptions(): Promise<AlertSubscription[]> {
    return await db
      .select()
      .from(alertSubscriptions)
      .where(eq(alertSubscriptions.isActive, true));
  }

  async updateThreatDetection(id: number, updates: Partial<InsertThreatDetection>): Promise<void> {
    await db
      .update(threatDetection)
      .set(updates)
      .where(eq(threatDetection.id, id));
  }
}

export const storage = new DatabaseStorage();
