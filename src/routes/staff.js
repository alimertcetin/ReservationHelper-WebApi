import express from 'express';
import { prisma } from '../config/db.js'; // Use your centralized client

const router = express.Router();

// READ ALL
router.get('/', async (req, res) => {
  try {
    const staff = await prisma.staff.findMany();
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE
router.post('/', async (req, res) => {
  const { name, role } = req.body;
  try {
    const newStaff = await prisma.staff.create({
      data: { name, role }
    });
    res.status(201).json(newStaff);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const updated = await prisma.staff.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(updated);
  } catch (err) {
    res.status(404).json({ error: "Staff not found" });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await prisma.staff.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.status(204).send();
  } catch (err) {
    res.status(404).json({ error: "Could not delete" });
  }
});

export default router;