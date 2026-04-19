import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

router.get('/all', async (req, res) => {
  const { q } = req.query;
  const roomTypes = await prisma.roomType.findMany();
  res.json(roomTypes);
});

router.post('/', async(req, res) => {
  const { name, description, capacity } = req.body;
  const roomType = await prisma.roomType.create({
    data: { name, description, capacity }
  });
  res.status(201).json(roomType);
})

router.put('/:id', async (req, res) => {
  try {
      const roomType = await prisma.roomType.update({
      where: { id: parseInt(req.params.id) },
      data: req.body,
      }); 
    res.json(roomType);
  }
  catch (err) {
    res.status(500).json({error: err});
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.roomType.delete({
      where: {id: parseInt(req.params.id)},
    });
    res.status(204).send();
  }
  catch (err) {
    res.status(500);
  }
});

export default router;