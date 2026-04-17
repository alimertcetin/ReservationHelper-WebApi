import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// GET all settings as a key-value object
router.get('/', async (req, res) => {
  const settings = await prisma.systemSetting.findMany();
  const config = settings.reduce((acc, curr) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});
  res.json(config);
});

// POST update or create a setting
router.post('/', async (req, res) => {
  const { key, value } = req.body;

  if (!key) return res.status(400).json({ error: "Key is required" });

  try {
    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) }
    });
    res.json(setting);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save setting" });
  }
});

export default router;