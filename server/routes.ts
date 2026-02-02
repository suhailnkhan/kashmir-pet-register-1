import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertPetRegistrationSchema } from "../shared/schema";
import { z } from "zod";
import { BLOCKS, BLOCK_DISPENSARIES, DEFAULT_VET_CREDENTIALS, ALL_DISPENSARIES } from "../shared/kupwara-data";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  let authorityPassword = 'admin123';

  app.post('/api/authority/login', async (req, res) => {
    try {
      const { password } = req.body;
      if (password === authorityPassword) {
        res.json({ success: true });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/authority/change-password', async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'All fields are required' });
      }
      
      if (currentPassword !== authorityPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      
      authorityPassword = newPassword;
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  app.post('/api/vet/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      
      let vetOfficer = await storage.getVetOfficerByUsername(username);
      
      if (!vetOfficer) {
        const credEntry = Object.entries(DEFAULT_VET_CREDENTIALS).find(
          ([, cred]) => cred.username === username
        );
        
        if (credEntry && credEntry[1].password === password) {
          const dispensary = credEntry[0];
          const block = Object.entries(BLOCK_DISPENSARIES).find(
            ([, disps]) => disps.includes(dispensary)
          )?.[0] || '';
          
          vetOfficer = await storage.createVetOfficer({
            username,
            password,
            dispensary,
            block,
            isActive: 'true',
          });
        }
      }
      
      if (!vetOfficer || vetOfficer.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      res.json({
        id: vetOfficer.id,
        username: vetOfficer.username,
        dispensary: vetOfficer.dispensary,
        block: vetOfficer.block,
        officerName: vetOfficer.officerName,
      });
    } catch (error: any) {
      console.error('Vet login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });
  
  app.post('/api/registrations', async (req, res) => {
    try {
      const validatedData = insertPetRegistrationSchema.parse(req.body);
      const submittedBy = req.body.submittedBy || 'owner';
      
      let status = 'pending_vet_review';
      if (submittedBy === 'vet') {
        status = 'pending_authority_approval';
      }
      
      const registration = await storage.createPetRegistration({
        ...validatedData,
        district: 'Kupwara',
        status,
        submittedBy,
      });
      
      res.json(registration);
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(400).json({ error: error.message || 'Invalid registration data' });
    }
  });
  
  app.get('/api/registrations/verify/:registrationNumber', async (req, res) => {
    try {
      const registration = await storage.getPetRegistrationByNumber(
        decodeURIComponent(req.params.registrationNumber)
      );
      
      if (!registration) {
        return res.status(404).json({ error: 'Registration not found' });
      }
      
      res.json({
        id: registration.id,
        registrationNumber: registration.registrationNumber,
        status: registration.status,
        ownerName: registration.ownerName,
        ownerAddress: registration.ownerAddress,
        mobile: registration.mobile,
        district: registration.district,
        block: registration.block,
        dispensary: registration.dispensary,
        species: registration.species,
        breed: registration.breed,
        petName: registration.petName,
        sex: registration.sex,
        age: registration.age,
        color: registration.color,
        markOfIdentification: registration.markOfIdentification,
        vaccinationStatus: registration.vaccinationStatus,
        vaccinationDate: registration.vaccinationDate,
        photoUrl: registration.photoUrl,
        createdAt: registration.createdAt,
      });
    } catch (error: any) {
      console.error('Verify error:', error);
      res.status(500).json({ error: 'Failed to verify registration' });
    }
  });

  app.get('/api/registrations/:registrationNumber', async (req, res) => {
    try {
      const registration = await storage.getPetRegistrationByNumber(
        decodeURIComponent(req.params.registrationNumber)
      );
      
      if (!registration) {
        return res.status(404).json({ error: 'Registration not found' });
      }
      
      res.json(registration);
    } catch (error: any) {
      console.error('Fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch registration' });
    }
  });
  
  app.get('/api/registrations', async (req, res) => {
    try {
      const { search = '', district, species, status, dispensary } = req.query;
      
      const registrations = await storage.searchPetRegistrations(
        search as string,
        {
          district: district as string,
          species: species as string,
          status: status as string,
          dispensary: dispensary as string,
        }
      );
      
      res.json(registrations);
    } catch (error: any) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to search registrations' });
    }
  });

  app.post('/api/vet/change-password', async (req, res) => {
    try {
      const { username, currentPassword, newPassword } = req.body;
      
      if (!username || !currentPassword || !newPassword) {
        return res.status(400).json({ error: 'All fields are required' });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      
      const vetOfficer = await storage.getVetOfficerByUsername(username);
      
      if (!vetOfficer || vetOfficer.password !== currentPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      
      await storage.updateVetOfficerPassword(vetOfficer.id, newPassword);
      
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error: any) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  app.patch('/api/registrations/:registrationNumber/status', async (req, res) => {
    try {
      const { status, vetRemarks, authorityRemarks } = req.body;
      
      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }
      
      const validStatuses = ['pending_vet_review', 'pending_authority_approval', 'approved', 'rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      
      const updated = await storage.updateRegistrationStatus(
        decodeURIComponent(req.params.registrationNumber),
        status,
        { vetRemarks, authorityRemarks }
      );
      
      if (!updated) {
        return res.status(404).json({ error: 'Registration not found' });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error('Update error:', error);
      res.status(500).json({ error: 'Failed to update registration status' });
    }
  });

  app.get('/api/registrations/by-id/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID' });
      }
      
      const registration = await storage.getPetRegistrationById(id);
      
      if (!registration) {
        return res.status(404).json({ error: 'Registration not found' });
      }
      
      res.json(registration);
    } catch (error: any) {
      console.error('Fetch by id error:', error);
      res.status(500).json({ error: 'Failed to fetch registration' });
    }
  });

  app.patch('/api/registrations/by-id/:id/status', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID' });
      }
      
      const { status, vetRemarks, authorityRemarks } = req.body;
      
      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }
      
      const validStatuses = ['pending_vet_review', 'pending_authority_approval', 'approved', 'rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      
      const registration = await storage.getPetRegistrationById(id);
      if (!registration) {
        return res.status(404).json({ error: 'Registration not found' });
      }
      
      if (status === 'approved' && !registration.registrationNumber) {
        const updated = await storage.approveRegistrationWithNumber(id, registration.species, authorityRemarks);
        if (!updated) {
          return res.status(500).json({ error: 'Failed to approve registration' });
        }
        return res.json(updated);
      }
      
      const updated = await storage.updateRegistrationStatusById(
        id,
        status,
        { vetRemarks, authorityRemarks }
      );
      
      if (!updated) {
        return res.status(404).json({ error: 'Registration not found' });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error('Update by id error:', error);
      res.status(500).json({ error: 'Failed to update registration status' });
    }
  });

  return httpServer;
}
