import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  country: text("country"),
  state: text("state"),
  source: text("source").notNull(), // 'gps' or 'search'
  createdAt: timestamp("created_at").defaultNow(),
});

export const storms = pgTable("storms", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  intensity: real("intensity").notNull(), // dBZ
  distance: real("distance").notNull(), // miles from location
  direction: integer("direction").notNull(), // degrees
  speed: real("speed").notNull(), // mph
  type: text("type").notNull(),
  description: text("description"),
  detectedAt: timestamp("detected_at").defaultNow(),
});

export const weatherAlerts = pgTable("weather_alerts", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull(),
  event: text("event").notNull(),
  severity: text("severity").notNull(),
  headline: text("headline"),
  description: text("description"),
  sent: timestamp("sent").notNull(),
  expires: timestamp("expires"),
  areas: text("areas"),
});

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  createdAt: true,
});

export const insertStormSchema = createInsertSchema(storms).omit({
  id: true,
  detectedAt: true,
});

export const insertWeatherAlertSchema = createInsertSchema(weatherAlerts).omit({
  id: true,
});

// Location search schema
export const locationSearchSchema = z.object({
  query: z.string().min(1, "Search query is required"),
});

// Weather data request schema
export const weatherDataRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radius: z.number().min(5).max(50).default(30),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type Storm = typeof storms.$inferSelect;
export type InsertStorm = z.infer<typeof insertStormSchema>;

export type WeatherAlert = typeof weatherAlerts.$inferSelect;
export type InsertWeatherAlert = z.infer<typeof insertWeatherAlertSchema>;

export type LocationSearchRequest = z.infer<typeof locationSearchSchema>;
export type WeatherDataRequest = z.infer<typeof weatherDataRequestSchema>;
