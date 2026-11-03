
import mongoose from 'mongoose'

export async function connectDatabase() {
  const uri = process.env.MONGO_URI?.trim()

  if (!uri) {
    throw new Error('MONGO_URI is not configured')
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      family: 4
    })

    console.log('MongoDB connected successfully')
  } catch (error) {
    console.error('[database] connection failed', {
      name: error instanceof Error ? error.name : 'Error',
      code: error?.code,
      codeName: error?.codeName
    })

    if (error?.code === 8000 || error?.codeName === 'AtlasError') {
      throw new Error(
        'MongoDB Atlas authentication failed. Check MONGO_URI username and password.'
      )
    }

    throw new Error(
      'MongoDB connection failed. Check MONGO_URI and Atlas Network Access.'
    )
  }
}
