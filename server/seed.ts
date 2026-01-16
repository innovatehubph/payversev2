import { storage } from "./storage";
import bcrypt from "bcrypt";

export async function seedAdminAccount() {
  try {
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || "admin@payverse.ph";
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || "admin123";
    const superAdminName = process.env.SUPER_ADMIN_NAME || "PayVerse Super Admin";
    const superAdminUsername = process.env.SUPER_ADMIN_USERNAME || "superadmin";
    
    const existingSuperAdmin = await storage.getUserByEmail(superAdminEmail);
    
    if (!existingSuperAdmin) {
      const hashedPassword = await bcrypt.hash(superAdminPassword, 10);
      await storage.createUser({
        email: superAdminEmail,
        password: hashedPassword,
        fullName: superAdminName,
        username: superAdminUsername,
        kycStatus: "verified",
        isActive: true,
        isAdmin: true,
        role: "super_admin"
      });
      console.log(`[Seed] Super admin account created: ${superAdminEmail}`);
    } else if (existingSuperAdmin.role !== "super_admin") {
      await storage.updateUserRole(existingSuperAdmin.id, "super_admin");
      console.log(`[Seed] Existing account upgraded to super_admin: ${superAdminEmail}`);
    } else {
      console.log(`[Seed] Super admin already exists: ${superAdminEmail}`);
    }
    
    // Migrate existing admins to have proper role
    await migrateExistingAdmins();
  } catch (error) {
    console.error("[Seed] Failed to seed admin account:", error);
  }
}

async function migrateExistingAdmins() {
  try {
    const allUsers = await storage.getAllUsers();
    let migrated = 0;
    
    for (const user of allUsers) {
      // If user has isAdmin=true but role is still 'user', upgrade to 'admin'
      if (user.isAdmin && user.role === "user") {
        await storage.updateUserRole(user.id, "admin");
        migrated++;
      }
    }
    
    if (migrated > 0) {
      console.log(`[Seed] Migrated ${migrated} existing admin(s) to role-based system`);
    }
  } catch (error) {
    console.error("[Seed] Failed to migrate existing admins:", error);
  }
}
