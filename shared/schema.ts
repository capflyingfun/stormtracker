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

// User alert preferences for personalized notifications
export const userAlertPreferences = pgTable("user_alert_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  locationId: integer("location_id").references(() => locations.id),
  
  // Storm intensity thresholds (dBZ)
  lightRainEnabled: boolean("light_rain_enabled").default(false),
  moderateRainEnabled: boolean("moderate_rain_enabled").default(true),
  heavyRainEnabled: boolean("heavy_rain_enabled").default(true),
  veryHeavyRainEnabled: boolean("very_heavy_rain_enabled").default(true),
  extremeStormEnabled: boolean("extreme_storm_enabled").default(true),
  
  // Distance thresholds (miles)
  alertRadius: real("alert_radius").default(30),
  
  // Alert types
  emailEnabled: boolean("email_enabled").default(false),
  pushEnabled: boolean("push_enabled").default(true),
  soundEnabled: boolean("sound_enabled").default(true),
  
  // Risk-based settings
  riskLevel: text("risk_level").default("medium"), // low, medium, high
  alertFrequency: integer("alert_frequency").default(15), // minutes between alerts
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Personalized risk alerts table
export const riskAlerts = pgTable("risk_alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  locationId: integer("location_id").references(() => locations.id),
  
  // Alert details
  alertType: text("alert_type").notNull(), // "storm_approaching", "intensity_increase", "lightning_detected"
  riskLevel: text("risk_level").notNull(), // "low", "medium", "high", "extreme"
  title: text("title").notNull(),
  message: text("message").notNull(),
  
  // Storm/weather data
  stormCount: integer("storm_count").default(0),
  maxIntensity: real("max_intensity").default(0),
  nearestDistance: real("nearest_distance").default(999),
  lightningCount: integer("lightning_count").default(0),
  
  // Alert status
  isRead: boolean("is_read").default(false),
  isDismissed: boolean("is_dismissed").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
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

export const insertUserAlertPreferencesSchema = createInsertSchema(userAlertPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRiskAlertSchema = createInsertSchema(riskAlerts).omit({
  id: true,
  createdAt: true,
});

export const updateUserAlertPreferencesSchema = createInsertSchema(userAlertPreferences).omit({
  id: true,
  userId: true,
  locationId: true,
  createdAt: true,
}).partial();

// Risk assessment schema
export const riskAssessmentSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-90).max(90),
  storms: z.array(z.object({
    lat: z.number(),
    lon: z.number(),
    intensity: z.number(),
    distance: z.number().optional(),
  })),
  lightningCount: z.number().default(0),
  preferences: z.object({
    riskLevel: z.enum(['low', 'medium', 'high']),
    alertRadius: z.number().default(30),
    lightRainEnabled: z.boolean().default(false),
    moderateRainEnabled: z.boolean().default(true),
    heavyRainEnabled: z.boolean().default(true),
    veryHeavyRainEnabled: z.boolean().default(true),
    extremeStormEnabled: z.boolean().default(true),
  }),
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
