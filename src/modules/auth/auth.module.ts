import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenBlacklistService } from './token-blacklist.service';
import { LogModule } from '../../common/log/log.module';

@Module({
  imports: [
    LogModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // @nestjs/jwt 11 mengetatkan tipe expiresIn ke literal "1d"/"8h"/dst — nilai dari
        // env tetap valid di runtime (lib `ms`), cuma perlu di-cast karena berasal dari string biasa.
        signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') || '8h') as any },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenBlacklistService],
  exports: [AuthService, JwtModule, TokenBlacklistService],
})
export class AuthModule {}
