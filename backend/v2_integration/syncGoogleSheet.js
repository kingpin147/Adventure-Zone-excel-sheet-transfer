import { extendedBookings } from '@wix/bookings';
import { auth } from '@wix/essentials';
import wixData from 'wix-data';
import { submissions, forms } from '@wix/forms';
import { syncBookingsToSheet } from './syncService';

/**
 * Scheduled Job function to sync the next 10 days of bookings to Google Sheets.
 * This is designed to be called from jobs.config.
 */
export async function export10DaysToGoogleSheets(triggerMetadata) {
    const triggerSource = triggerMetadata ? "Scheduled Job" : "Manual/Direct Call";
    await logToCMS("Sync Triggered", `Execution started via ${triggerSource}`);

    try {
        // 1. Calculate the 10-day window
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const endWindow = new Date(startOfToday.getTime());
        endWindow.setDate(endWindow.getDate() + 10);
        endWindow.setHours(23, 59, 59, 999);

        console.log(`Syncing bookings from ${startOfToday.toISOString()} to ${endWindow.toISOString()}`);

        // 2. Fetch all bookings in the window using Extended Universal API
        const elevatedQuery = auth.elevate(extendedBookings.queryExtendedBookings);
        const results = await elevatedQuery({
            filter: {
                "$and": [
                    { "startDate": { "$gte": startOfToday.toISOString() } },
                    { "startDate": { "$lte": endWindow.toISOString() } },
                    { "status": { "$in": ["CONFIRMED", "PENDING"] } }
                ]
            }
        });

        let allResults = results.extendedBookings || [];

        if (allResults.length === 0) {
            await logToCMS("Sync Warning", "No bookings found in the next 10 days.");
            return;
        }

        // 3. Sort chronologically by startTime
        allResults.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        
        // 4. Fetch up-to-date form submissions via Wix Forms v2 (Using Wix Support Method)
        const BOOKING_FORMS_NAMESPACE = "wix.bookings.v2.bookings";
        
        function findTextFieldContent(field) {
            if (typeof field !== 'object' || field === null) return field;
            const stack = [field];
            while (stack.length > 0) {
                const current = stack.pop();
                if ('text' in current) return current.text;
                for (const key in current) {
                    if (Object.prototype.hasOwnProperty.call(current, key)) {
                        const value = current[key];
                        if (typeof value === 'object' && value !== null) stack.push(value);
                    }
                }
            }
            return field;
        }

        const enrichSubmission = (submission, formFields) => {
            if (!submission || !formFields) return;
            const targetLabelMapping = formFields.reduce((acc, field) => (field.target ? {
                ...acc,
                [field.target]: findTextFieldContent(field.view.label),
            } : acc), {});

            return Object.fromEntries(
                Object.entries(submission).map(([target, value]) => {
                    const label = targetLabelMapping[target] || target;
                    return [label, value];
                })
            );
        };

        const findings = allResults.map(rb => {
            const b = rb.booking || rb;
            return {
                bookingId: b._id,
                submissionId: b.formSubmissionId || (b.formInfo ? b.formInfo.formSubmissionId || b.formInfo.submissionId : null),
                formId: b.formId || (b.formInfo ? b.formInfo.formId : null)
            };
        }).filter(f => f.submissionId);

        const submissionsByBookingId = {};
        
        if (findings.length > 0) {
            console.log("Fetching latest form submissions using Wix Support method...");
            try {
                // Rely on top level import of submissions and forms
                const elevatedQuerySubmissions = auth.elevate(submissions.querySubmissionsByNamespace);
                const [bookingSubmissions, {forms: bookingForms}] = await Promise.all([
                    elevatedQuerySubmissions()
                        .eq("namespace", BOOKING_FORMS_NAMESPACE)
                        .in("_id", findings.map(f => f.submissionId))
                        .find(),
                    forms.listForms(BOOKING_FORMS_NAMESPACE, {enabled: true})
                ]);

                console.log(`Found ${bookingSubmissions.items.length} submissions from Wix`);

                findings.forEach(finding => {
                    const relevantSubmission = bookingSubmissions.items.find(s => s._id === finding.submissionId);
                    const relevantForm = bookingForms.find(f => f._id === finding.formId);

                    if (relevantSubmission && relevantForm) {
                        const enriched = enrichSubmission(relevantSubmission.submissions, relevantForm.fields);
                        submissionsByBookingId[finding.bookingId] = enriched;
                    } else if (relevantSubmission) {
                        // Fallback if form not found
                        submissionsByBookingId[finding.bookingId] = relevantSubmission.submissions;
                    }
                });
            } catch (err) {
                console.warn(`Could not fetch submissions using Wix method:`, err.message);
            }
        }

        // 5. Send to Google Sheets via syncService
        console.log(`Processing ${allResults.length} bookings for Google Sheets...`);
        await syncBookingsToSheet(allResults, submissionsByBookingId);

    } catch (err) {
        console.error("Sync Job Failed:", err.message);
        await logToCMS("Sync Job Error", err.message);
    }
}

/**
 * Utility to log events to the CMS 'logs' collection.
 */
async function logToCMS(title, message) {
    try {
        await wixData.insert("logs", {
            title: `Sync Job: ${title}`,
            message: message,
            timestamp: new Date()
        });
    } catch (e) {
        console.error("CMS Logging failed in Sync Job:", e.message);
    }
}
