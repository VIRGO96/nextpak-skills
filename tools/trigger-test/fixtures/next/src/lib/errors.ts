export class AppError extends Error {
  constructor(
    public readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super('UNAUTHORIZED', 'Please sign in to continue.');
  }
}
export class ForbiddenError extends AppError {
  constructor() {
    super('FORBIDDEN', 'You do not have access to this item.');
  }
}
export class NotFoundError extends AppError {
  constructor(resource = 'Item') {
    super('NOT_FOUND', `${resource} not found.`);
  }
}
