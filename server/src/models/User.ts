import bcrypt from 'bcryptjs';
import { Schema, model, type Document, type Model, type Types } from 'mongoose';

const BCRYPT_COST = 12;

export interface IUser extends Document {
  _id: Types.ObjectId;
  username: string;
  email: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(plain: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username must be at most 30 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      // `unique` already creates the index — adding `index: true` would build
      // a second, redundant one.
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      // Never leaves the database unless explicitly re-selected.
      select: false,
    },
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, BCRYPT_COST);
  next();
});

userSchema.methods.comparePassword = function comparePassword(plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.password);
};

export interface SafeUser {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
}

export function toSafeUser(user: IUser): SafeUser {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export const User: Model<IUser> = model<IUser>('User', userSchema);
