import { Permissions, webMethod } from "wix-web-module";
import { runV2Migration } from './migration.web';

/**
 * Trigger a Dry Run migration.
 * This will NOT create actual V2 bookings or cancel V1 bookings.
 * Instead, it will output results to the 'MigrationTestResults' CMS collection.
 */
export const testDryRun = webMethod(Permissions.Admin, async () => {
    console.log("Starting Migration Dry Run...");
    const result = await runV2Migration();
    return {
        message: "Dry Run completed. Please check 'MigrationTestResults' CMS collection.",
        result
    };
});

/**
 * Trigger the LIVE migration.
 * WARNING: This will create actual V2 bookings and CANCEL the original V1 bookings.
 * Only run this after verifying the Dry Run results and disabling Wix Automations.
 */
export const testLiveRun = webMethod(Permissions.Admin, async (confirm) => {
    if (confirm !== "I_AM_SURE") {
        return {
            error: "You must pass 'I_AM_SURE' to trigger the live migration."
        };
    }

    // Note: To run this for real, you must change DRY_RUN = false in migration.web.js
    // This is a safety measure.
    
    console.log("Starting LIVE Migration...");
    const result = await runV2Migration();
    return {
        message: "Live Migration completed.",
        result
    };
});
