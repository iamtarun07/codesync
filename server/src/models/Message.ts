import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export const MAX_MESSAGE_LENGTH = 2000;

export interface IMessage extends Document {
  _id: Types.ObjectId;
  room: Types.ObjectId;
  sender: Types.ObjectId;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    room: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: MAX_MESSAGE_LENGTH },
  },
  { timestamps: true },
);

messageSchema.index({ room: 1, createdAt: -1 });

export const Message: Model<IMessage> = model<IMessage>('Message', messageSchema);
