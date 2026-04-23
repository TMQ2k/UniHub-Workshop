import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for student self-registration.
 * studentId is optional — auto-generated if not provided.
 */
export class RegisterDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  studentId?: string;

  @IsNotEmpty({ message: 'Họ tên không được để trống.' })
  @IsString()
  @MaxLength(255)
  fullName!: string;

  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @IsNotEmpty({ message: 'Email không được để trống.' })
  email!: string;

  @IsNotEmpty({ message: 'Mật khẩu không được để trống.' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự.' })
  password!: string;
}
