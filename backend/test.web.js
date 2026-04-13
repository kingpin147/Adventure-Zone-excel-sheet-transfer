import { Permissions, webMethod } from 'wix-web-module';
import { extendedBookings } from '@wix/bookings';
import { auth } from '@wix/essentials';

export const testGetLast10DaysBookings = webMethod(Permissions.Admin, async () => {
    try {
        const elevatedQuery = auth.elevate(extendedBookings.queryExtendedBookings);

        const now = new Date();
        // Calculate 10 days ago (for the "last 10 days")
        const startWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10, 0, 0, 0);
        
        // If you actually meant "next 10 days", you would do:
        // const startWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        // const endWindow = new Date(startWindow.getTime());
        // endWindow.setDate(endWindow.getDate() + 10);
        // endWindow.setHours(23, 59, 59, 999);

        // We will stick to last 10 days:
        const endWindow = new Date(now.getTime());

        console.log(`Querying bookings from ${startWindow.toISOString()} to ${endWindow.toISOString()}`);

        const q = {
            filter: {
                "$and": [
                    { "startDate": { "$gte": startWindow.toISOString() } },
                    { "startDate": { "$lte": endWindow.toISOString() } }
                ]
            },
            cursorPaging: {
                limit: 100
            }
        };

        const results = await elevatedQuery(q);
        const bookings = results.extendedBookings || [];
        
        console.log(`Test completely successful! Found ${bookings.length} bookings.`);
        
        // Return only a few key details to keep the test log manageable
        return bookings.map(b => {
            const actualBooking = b.booking || b;
            return {
                id: actualBooking._id,
                serviceName: actualBooking.bookedService?.name || actualBooking.bookedEntity?.title,
                startDate: actualBooking.startDate || actualBooking.selectedSession?.start?.timestamp,
                contactEmail: actualBooking.contactDetails?.email
            };
        });

    } catch (error) {
        console.error("Test function failed with error:", error);
        throw error;
    }
});
