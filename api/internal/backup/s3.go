package backup

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const s3Key = "milmil/preferences.json"

func newS3Client(endpoint, accessKey, secretKey, region string) *s3.Client {
	if region == "" {
		region = "us-east-1"
	}

	cfg := aws.Config{
		Region:      region,
		Credentials: credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
	}

	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		if endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
		}
		o.UsePathStyle = true // Required for most S3-compatible services (MinIO, etc.)
	})
}

// UploadS3 uploads preference data to an S3-compatible bucket.
func UploadS3(endpoint, bucket, accessKey, secretKey, region string, data []byte) error {
	client := newS3Client(endpoint, accessKey, secretKey, region)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	contentType := "application/json"
	_, err := client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(s3Key),
		Body:        bytes.NewReader(data),
		ContentType: &contentType,
	})
	if err != nil {
		return fmt.Errorf("backup/s3: upload: %w", err)
	}
	return nil
}

// DownloadS3 downloads preference data from an S3-compatible bucket.
func DownloadS3(endpoint, bucket, accessKey, secretKey, region string) ([]byte, error) {
	client := newS3Client(endpoint, accessKey, secretKey, region)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(s3Key),
	})
	if err != nil {
		return nil, fmt.Errorf("backup/s3: download: %w", err)
	}
	defer out.Body.Close()

	body, err := io.ReadAll(out.Body)
	if err != nil {
		return nil, fmt.Errorf("backup/s3: read body: %w", err)
	}
	return body, nil
}

// TestS3 checks connectivity by listing objects with the given prefix.
func TestS3(endpoint, bucket, accessKey, secretKey, region string) error {
	client := newS3Client(endpoint, accessKey, secretKey, region)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	prefix := "milmil/"
	maxKeys := int32(1)
	_, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:  aws.String(bucket),
		Prefix:  &prefix,
		MaxKeys: &maxKeys,
	})
	if err != nil {
		return fmt.Errorf("backup/s3: connection test failed: %w", err)
	}
	return nil
}
