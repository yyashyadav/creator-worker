// Use the same mongoose instance as server models (they resolve to server/node_modules).
import mongoose from "../../../server/node_modules/mongoose/index.js";

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
    console.log("[worker] MongoDB connected");
  }
}

export default mongoose;
