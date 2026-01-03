import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

// Mock the database query function
jest.mock('../../db', () => ({
  query: jest.fn(),
}));

import { query } from '../../db';
import { authenticate, AuthRequest } from '../auth';
import { Response, NextFunction } from 'express';

describe('Authentication Middleware', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticate middleware', () => {
    it('should call next() when valid token is provided', async () => {
      const userId = 'test-user-id';
      const userEmail = 'test@example.com';
      const userName = 'Test User';
      const userRole = 'admin';

      // Create a valid token
      const token = jwt.sign(
        { id: userId, email: userEmail, name: userName, role: userRole },
        env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      // Mock database query for permissions
      (query as jest.Mock).mockResolvedValueOnce({
        rows: [
          { permission: 'can_view_dashboard' },
          { permission: 'can_manage_users' },
        ],
      });

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.id).toBe(userId);
      expect(mockRequest.user?.email).toBe(userEmail);
      expect(mockRequest.user?.role).toBe(userRole);
    });

    it('should return 401 when no token is provided', async () => {
      mockRequest.headers = {};

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'No token provided',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 when token format is invalid', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token',
      };

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 when token is expired', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { id: 'test-id', email: 'test@example.com', name: 'Test', role: 'user' },
        env.JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      mockRequest.headers = {
        authorization: `Bearer ${expiredToken}`,
      };

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Token expired',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 when token is invalid', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token-string',
      };

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid token',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should load user permissions from database', async () => {
      const userId = 'test-user-id';
      const token = jwt.sign(
        { id: userId, email: 'test@example.com', name: 'Test', role: 'admin' },
        env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      const mockPermissions = [
        { permission: 'can_view_dashboard' },
        { permission: 'can_manage_users' },
        { permission: 'can_view_financials' },
      ];

      (query as jest.Mock).mockResolvedValueOnce({
        rows: mockPermissions,
      });

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(query).toHaveBeenCalledWith(
        'SELECT permission FROM user_permissions WHERE user_id = $1 AND granted = true',
        [userId]
      );
      expect(mockRequest.user?.permissions).toEqual([
        'can_view_dashboard',
        'can_manage_users',
        'can_view_financials',
      ]);
    });
  });
});
