-- Latest per-port report (probe reading + pump state) for the Devices page.
ALTER TABLE "Device" ADD COLUMN "portStatus" JSONB;
