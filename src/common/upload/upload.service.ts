import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadService {
  constructor(private config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get('CLOUDINARY_CLOUD_NAME'),
      api_key:    config.get('CLOUDINARY_API_KEY'),
      api_secret: config.get('CLOUDINARY_API_SECRET'),
    });
  }

  // Upload buffer (dari Multer) ke Cloudinary
  async uploadFile(
    buffer: Buffer,
    folder: string,  // contoh: 'wo-foto', 'ba-pdf', 'bast-pdf'
    filename: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `erp-next1/${folder}`, public_id: filename, resource_type: 'auto' },
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });
  }

  async deleteFile(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}
