import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// GET all templates
router.get('/', async (req, res) => {
  const templates = await prisma.messageTemplate.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  });
  res.json(templates);
});

// POST new or update template (Upsert style)
router.post('/', async (req, res) => {
  const { id, name, content, category } = req.body;

  try {
    const template = await prisma.messageTemplate.upsert({
      where: { id: id || -1 },
      update: { 
        name, 
        content, 
        category: category || "GUEST" 
      },
      create: { 
        name, 
        content, 
        category: category || "GUEST" 
      }
    });
    res.status(id ? 200 : 201).json(template);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Template data is invalid or name conflict" });
  }
});

// DELETE template (Soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await prisma.messageTemplate.update({
      where: { id: parseInt(req.params.id) },
      data: { isActive: false }
    });
    res.status(204).send();
  } catch (err) {
    res.status(404).json({ error: "Template not found" });
  }
});

export default router;