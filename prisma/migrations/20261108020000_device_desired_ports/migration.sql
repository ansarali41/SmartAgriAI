-- Port count chosen in the app; the board applies it on its next command poll.
ALTER TABLE "Device" ADD COLUMN "desiredPorts" INTEGER;
