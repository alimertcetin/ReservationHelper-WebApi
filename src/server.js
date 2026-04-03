import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import reservationRoutes from './routes/reservations.js';
import staffRoutes from './routes/staff.js';
import accountRoutes from './routes/accounts.js';
import guestRoutes from './routes/guests.js';
import priceRoutes from './routes/prices.js';
import { connectDB, disconnectDB } from './config/db.js';

dotenv.config();

const app = express();
app.use(express.json()); // Essential for req.body!
app.use(cors());
connectDB();

// Routes
app.use('/api/reservations', reservationRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/prices', priceRoutes);


const PORT = process.env.PORT || 5005;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

/* Close Connection on error */
process.on("unhandledRejection", (err) => {
	console.error("Unhandled Rejection", err);
	server.close(async () => {
		await disconnectDB();
		process.exit(1);
	})
});

process.on("uncaughtException", async (err) => {
	console.error("Uncaught Exception:", err);
	await disconnectDB();
	process.exit(1);
});

process.on("SIGTERM", async () => {
	console.log("SIGTERM received, shutting down gracefully");
	server.close(async () => {
		await disconnectDB();
		process.exit(0);
	})
});