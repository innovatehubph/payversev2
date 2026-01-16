import { storage } from "./storage";
import bcrypt from "bcrypt";
import { registerPaygramUser } from "./paygram";

export async function seedAdminAccount() {
  try {
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || "admin@payverse.ph";
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || "admin123";
    const superAdminName = process.env.SUPER_ADMIN_NAME || "PayVerse Super Admin";
    const superAdminUsername = process.env.SUPER_ADMIN_USERNAME || "superadmin";
    // PayGram CLI ID is the same as the username (superadmin)
    const paygramCliId = superAdminUsername;

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

      // Register super admin on PayGram with their username
      registerPaygramUser(superAdminUsername).catch(err => {
        console.warn(`[Seed] PayGram registration for ${superAdminUsername} failed (may already exist):`, err.message);
      });

      // Also register the PayGram CLI ID if different from username
      if (paygramCliId !== superAdminUsername) {
        registerPaygramUser(paygramCliId).catch(err => {
          console.warn(`[Seed] PayGram registration for ${paygramCliId} failed (may already exist):`, err.message);
        });
      }
    } else if (existingSuperAdmin.role !== "super_admin") {
      await storage.updateUserRole(existingSuperAdmin.id, "super_admin");
      console.log(`[Seed] Existing account upgraded to super_admin: ${superAdminEmail}`);
    } else {
      console.log(`[Seed] Super admin already exists: ${superAdminEmail}`);

      // Ensure PayGram registration exists for existing super admin
      registerPaygramUser(existingSuperAdmin.username).catch(err => {
        // Silent fail - user likely already registered
      });
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
