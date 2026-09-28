import mongoose from 'mongoose'

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) {
    throw new Error('MONGODB_URI or MONGO_URI is not configured')
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      family: 4
    })
    console.log('MongoDB connected')
  } catch (error) {
    if (error?.code === 8000 || error?.codeName === 'AtlasError') {
      throw new Error(
        'MongoDB Atlas authentication failed. Check the database username, password, and URL-encoded special characters in MONGODB_URI.'
      )
    }

    throw new Error(`MongoDB connection failed: ${error.message}`)
  }
}
